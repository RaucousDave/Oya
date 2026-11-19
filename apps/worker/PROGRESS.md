# Worker progress

Last updated by: Codex, 2026-11-19
Current phase: 7 (worker-side notifications implemented; PostgreSQL adapter needs approval)

## Phases (mark [x] only when typecheck and tests pass)
- [x] 1. packages/chain: ChainAdapter (viem, Base Sepolia). Script printing latest block and Transfer events for the last 50 blocks. Vitest tests for log-to-ChainTransfer mapping using fake logs. No DB.
- [x] 2. Scan processor and cursor. CursorRepository interface with an in-memory fake (real table goes under "Needs approval"). Chunked loop, scan job on a timer. Tests: normal scan, first run, restart resumes from cursor, same range twice does not double-count.
- [x] 3. Transfer processing transaction. Tests: duplicate tx_hash, unknown address, refused transition, top-up.
- [x] 4. Confirm job. Tests: exact, underpaid, overpaid, top-up, confirmations below 2.
- [x] 5. Expire job. Tests: expiry at rate lock, 5-minute top-up grace, transfer arriving just before expiry wins.
- [x] 6. Payout job with the mock provider, ledger entries, payout row, receipt. Tests: retry creates no duplicates.
- [ ] 7. Postgres NOTIFY after each committed status change (processor boundary and fake implemented; real PostgreSQL adapter awaits approval).

## Commands
- Typecheck: `pnpm --filter @oya/chain typecheck` and `pnpm --filter @oya/worker typecheck`
- Test: `pnpm --filter @oya/chain test` and `pnpm --filter @oya/worker test`
- Run worker: `pnpm --filter @oya/worker start:dev`
- Live Base Sepolia script: `pnpm --filter @oya/chain test:live` (requires packages/chain/.env with RPC_URL, TOKEN_ADDRESS, TOKEN_DECIMALS)

## Decisions
- ChainTransfer is `{ txHash, blockNumber, to, amount }` per AGENTS.md. This supersedes the pre-existing shape `{ hash, from, to, value, blockNumber, logIndex }`.
- getConfirmations returns `number` per AGENTS.md, using `latest - blockNumber + 1`; future blocks clamp to 0 instead of returning a negative count.
- Added `zod` ^4.6.7 as a packages/chain dependency for env validation (RPC_URL, TOKEN_ADDRESS, TOKEN_DECIMALS). No other dependency added.
- Adapter depends on a small `ChainClient` interface (`getBlockNumber`, `getLogs`) so tests use fakes with no network and no `any`.
- getTransfersInRange calls `getLogs` filtered by TOKEN_ADDRESS, then `parseEventLogs` for the ERC-20 Transfer event, then maps to ChainTransfer. Address comparison is lowercased (case-insensitive).
- createBaseSepoliaClient now actually passes RPC_URL to `http()`; previously the URL argument was ignored.
- Consolidated the three ad-hoc network scripts into `src/tests/base-sepolia.live.ts`; removed `test.ts`, `test-adapter.ts`, `test-transfer.ts`, and replaced the npm scripts with `test:live`.
- Scan cursor is the last fully scanned block. The next scan starts at cursor + 1; a first run with no cursor starts at (and scans) the current latest block.
- Scan reads the cursor first, then the latest block, and walks forward in chunks of at most `chunkSize` (injected, default `DEFAULT_SCAN_CHUNK_SIZE = 500`).
- The cursor is saved per chunk only after every transfer in that chunk was handled successfully. A failing handler leaves the cursor at the last completed chunk.
- `CursorRepository` is an interface; `InMemoryCursorRepository` is the test fake. The real table is not created (see "Needs approval").
- `ScanJob` owns the timer and the overlap guard (synchronous `running` flag set before the first await). It catches and logs failed ticks through an injected `JobLogger`; no Nest dependency was added.
- Added `@oya/chain` as a workspace dependency of `@oya/worker` for the ChainAdapter/ChainTransfer types.
- packages/database is currently empty and has no db client or repositories. Phase 3 therefore defines `TransferTransactionRunner` / `TransferTransaction` interfaces and an `InMemoryTransferTransaction` fake; the real schema and repository methods are proposed under "Needs approval".
- `TransferProcessor` implements `TransferHandler` and always transitions a matched payment to `CONFIRMING` (new payment or top-up). Amount comparison and the PAID/UNDERPAID/OVERPAID decision belong to phase 4.
- The transfer transaction order is: find payment by lowercased deposit address -> insert chain_tx if absent (stop if present) -> domain `transitionPayment` -> update received amount + status -> insert audit event. Any error rolls the whole fake/real transaction back.
- Audit timestamps use the injected `Clock`; the timestamp produced inside `transitionPayment` is not used, because the domain transition has no clock parameter.
- Removed the phase-2 no-op `TransferHandler` implementation; `TransferProcessor` is now the implementation.
- Added `@oya/domain` and `@oya/contracts` as workspace dependencies of `@oya/worker`.
- The worker imports the domain transition via `@oya/domain/src/state-machine.js` because packages/domain has no `main`/`exports`; adding package exports is proposed under "Needs approval".
- Phase 4 Confirm reads chain txs below `CONFIRMATIONS_REQUIRED` (2) through `ConfirmTransactionReader` (part of `ConfirmTransactionRunner`), groups them by payment, and processes each payment group in its own transaction. A failing payment does not roll back already committed groups.
- Confirm computes confirmations locally as `latest - blockNumber + 1` from one `getLatestBlock()` call per tick (per the task), clamps future blocks to 0 and caps at `Number.MAX_SAFE_INTEGER`. `ChainAdapter.getConfirmations` remains unused by the worker.
- Confirm stores the new confirmation count on every chain tx in the group, then evaluates the payment only if at least one tx in the group reached the requirement.
- Confirmed total is computed by `sumConfirmedAmount(paymentId, required)` over chain txs with `confirmations >= required`, not from `payments.received_amount` (which includes still-unconfirmed transfers).
- Only `CONFIRMING` and `UNDERPAID` payments are evaluated. Other statuses have their confirmations stored but are not transitioned, so a refused transition cannot retry forever.
- Money comparison uses domain `comparePaymentAmounts`; `EXACT` maps to `PAID`, otherwise `UNDERPAID`/`OVERPAID`. `OVERPAID` writes one `OVERPAYMENT_SURPLUS` ledger entry equal to the difference.
- If an `UNDERPAID` payment reaches the requirement, Confirm emits two state-machine transitions in the same transaction: `UNDERPAID -> CONFIRMING` (`top_up_confirmed`) then `CONFIRMING -> PAID|OVERPAID`. This covers a top-up that confirmed after the payment was already marked underpaid.
- Confirm audit events use `txHash: null` because they summarise multiple chain txs; `AuditEvent.txHash` was widened to `Hex | null` to match the nullable DB column.
- Extracted `JobLogger` to `apps/worker/src/jobs/job-logger.ts`; `scan-job.ts` re-exports it so existing imports still work.
- Expire selects candidates with `findPaymentsByStatuses(["AWAITING_PAYMENT", "UNDERPAID"])` outside the transaction, then opens one transaction per candidate and re-reads the payment by id inside it. This is the race guard: a transfer that moved the payment to CONFIRMING/PAID before the re-read wins.
- A tick reads `clock.now()` once and uses that same instant for every candidate, so a tick is internally consistent.
- `AWAITING_PAYMENT` expires when `evaluatePaymentTiming` returns anything other than `VALID_RATE_WINDOW`, i.e. strictly after `createdAt + 60s`. `UNDERPAID` expires only when the decision is `EXPIRED`, i.e. strictly after `createdAt + 60s + 5min`. Boundaries are therefore exclusive, matching the domain helpers' strict comparisons.
- Expire reasons are `rate_lock_expired` (from AWAITING_PAYMENT) and `top_up_grace_expired` (from UNDERPAID). Audit rows use `txHash: null` and the tick's clock time.
- A re-read status that is neither AWAITING_PAYMENT nor UNDERPAID is left untouched without a refused transition, so a race cannot make the job retry forever.
- `ExpireJob` mirrors `ConfirmJob`: synchronous overlap guard, caught and logged tick failures ("Expire job failed"), interval start/stop. No chain dependency.
- Applied `evaluatePaymentTiming` and `transitionPayment` from `@oya/domain/src/*.js` subpaths, consistent with the existing worker imports (see the domain exports item under "Needs approval").
- Payout selects `PAID` payments only, then opens one transaction per candidate and re-reads the payment by id. A candidate that is no longer `PAID` at re-read is left untouched without a refused transition, so scan/expire races cannot make the job retry forever.
- The whole payout for one payment runs inside that single transaction: `PAID -> PAYOUT_PENDING` + audit, provider call, payout row, two ledger rows, receipt, `PAYOUT_PENDING -> SETTLED` + audit. A failure rolls every DB write back and leaves the payment `PAID`, so a retry restarts from the beginning with no partial rows.
- The provider call happens inside the transaction and receives `idempotencyKey = payment.id`. The database cannot roll back an external payout, so retry safety depends on the provider honouring that key. `MockPayoutProvider` stores results by key and returns the same provider reference for a repeated key.
- Payout ledger rows are both positive kobo amounts: `MERCHANT_BALANCE` credits the merchant and `PAYOUT` records the withdrawal; `entry_type` distinguishes direction (no negative amounts).
- The payout row status is the provider result status (`COMPLETED` for the mock), not a separate hardcoded value. The receipt snapshots merchant id, NGN kobo, token base units, rate string, tx hashes and `Clock` time.
- `PayoutTransaction` owns payout-specific ledger/receipt types instead of widening the confirm-only `LedgerEntryType`; the real `ledger_entries` table is shared.
- `PayoutJob` mirrors `ExpireJob`: synchronous overlap guard, caught and logged tick failures ("Payout job failed"), interval start/stop, no chain dependency.
- Each status-changing processor counts its committed status transitions inside the transaction callback and calls the injected `StatusNotifier` only after `run()` resolves. Transfer duplicate/unknown cases and no-op confirm/expire/payout cases produce no notification. Payout emits two notifications after its single transaction commits (`PAID -> PAYOUT_PENDING` and `PAYOUT_PENDING -> SETTLED`); a top-up confirmation similarly emits one per transition.
- `StatusNotifier` is a worker-owned boundary with an in-memory test fake. The PostgreSQL implementation must use `SELECT pg_notify('payment_status', $1)` after the transaction has committed; it cannot be implemented here because apps/worker has no database client and `packages/database` is read-only under AGENTS.md.
- Decision: emit one notifier call per actual state-machine transition, even when multiple transitions share one transaction, and perform all notifier calls only after the transaction runner resolves successfully. This preserves one event per committed change while ensuring rollback emits none.
- Session verification: `pnpm --filter @oya/chain typecheck` and `pnpm --filter @oya/worker typecheck` passed. After approval to run outside the sandbox, chain tests passed (12) and worker tests passed (47). The final worker suite includes notification assertions for transfer, confirm, expire, and both payout transitions.

## Needs approval
1. Cursor table (from phase 2):
```sql
CREATE TABLE chain_cursors (
  chain text PRIMARY KEY,
  last_scanned_block bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
Repository: `getCursor(chain)` -> `SELECT last_scanned_block ...`; `saveCursor(chain, blockNumber)` -> upsert with `ON CONFLICT (chain) DO UPDATE`.

2. Transfer processing schema and repositories (packages/database is empty, so nothing was touched):
```sql
CREATE TABLE payments (
  id uuid PRIMARY KEY,
  deposit_address text NOT NULL UNIQUE,
  status text NOT NULL,
  received_amount numeric(78,0) NOT NULL DEFAULT 0
);

CREATE TABLE chain_txs (
  tx_hash text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id),
  block_number bigint NOT NULL,
  to_address text NOT NULL,
  amount numeric(78,0) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  reason text NOT NULL,
  tx_hash text,
  created_at timestamptz NOT NULL
);
```
Required repository/db-client behavior (all bound to one `db.transaction`):
- `findPaymentByDepositAddress`: `SELECT id, deposit_address, status, received_amount FROM payments WHERE lower(deposit_address) = lower($1) LIMIT 1`.
- `insertChainTxIfAbsent`: `INSERT ... ON CONFLICT (tx_hash) DO NOTHING RETURNING tx_hash`; return whether a row was inserted.
- `updatePayment`: `UPDATE payments SET received_amount = $2, status = $3 WHERE id = $1`.
- `insertAuditEvent`: `INSERT INTO audit_events (...) VALUES (...)`.
- `TransferTransactionRunner.run` wraps the callback in the existing db client's `transaction(...)`.

3. Domain package exports:
```json
"main": "./src/index.ts",
"exports": { ".": "./src/index.ts" }
```
Then the worker can import `@oya/domain` instead of the internal subpath.

4. Confirm processing schema and repositories (read-only code, so nothing was changed):
```sql
ALTER TABLE payments ADD COLUMN required_amount numeric(78,0) NOT NULL;
ALTER TABLE chain_txs ADD COLUMN confirmations integer NOT NULL DEFAULT 0;

CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES payments(id),
  entry_type text NOT NULL,
  amount numeric(78,0) NOT NULL,
  created_at timestamptz NOT NULL
);
```
Required repository/db-client behavior (all bound to one `db.transaction`):
- `findChainTxsBelowConfirmations`: `SELECT tx_hash, payment_id, block_number, amount, confirmations FROM chain_txs WHERE confirmations < $1 ORDER BY payment_id`.
- `updateChainTxConfirmations`: `UPDATE chain_txs SET confirmations = $2 WHERE tx_hash = $1`.
- `findPayment`: `SELECT id, status, required_amount FROM payments WHERE id = $1`.
- `sumConfirmedAmount`: `SELECT COALESCE(SUM(amount), 0) FROM chain_txs WHERE payment_id = $1 AND confirmations >= $2`.
- `updatePaymentStatus`: `UPDATE payments SET status = $2 WHERE id = $1` (still preceded by a state-machine transition).
- `insertLedgerEntry`: `INSERT INTO ledger_entries (...) VALUES (...)`.
- `ConfirmTransactionRunner.run` wraps the callback in the existing db client's `transaction(...)`.
- `ledger_entries` should have a unique constraint on `(payment_id, entry_type)` if the real repository wants DB-level idempotency for the surplus row; the in-memory fake relies on the `confirmations` guard instead.

5. Expire processing schema and repositories (read-only code, so nothing was changed):
```sql
ALTER TABLE payments ADD COLUMN created_at timestamptz NOT NULL;
```
Rate-lock expiry is derived from `created_at`; no separate expiry timestamp column is stored. If the real `payments` table already has a creation timestamp, use that instead of adding a duplicate.
Required repository/db-client behavior (all bound to one `db.transaction`):
- `findPaymentsByStatuses`: `SELECT id, status, created_at FROM payments WHERE status = ANY($1)`.
- `findPayment`: `SELECT id, status, created_at FROM payments WHERE id = $1`.
- `updatePaymentStatus`: `UPDATE payments SET status = $2 WHERE id = $1` (still preceded by a state-machine transition).
- `insertAuditEvent`: `INSERT INTO audit_events (...) VALUES (...)`.
- `ExpireTransactionRunner.run` wraps the callback in the existing db client's `transaction(...)`.

6. Payout processing schema and repositories (read-only code, so nothing was changed):
```sql
ALTER TABLE payments ADD COLUMN merchant_id text NOT NULL;
ALTER TABLE payments ADD COLUMN ngn_amount_kobo bigint NOT NULL;
ALTER TABLE payments ADD COLUMN rate text NOT NULL;

CREATE TABLE payouts (
  id bigserial PRIMARY KEY,
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
  amount_kobo bigint NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE receipts (
  id bigserial PRIMARY KEY,
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
  merchant_id text NOT NULL,
  ngn_amount_kobo bigint NOT NULL,
  token_amount numeric(78,0) NOT NULL,
  rate text NOT NULL,
  tx_hashes text[] NOT NULL,
  created_at timestamptz NOT NULL
);

ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_payment_entry_unique
  UNIQUE (payment_id, entry_type);
```
Required repository/db-client behavior (all bound to one `db.transaction`):
- `findPaymentsByStatuses`: `SELECT id, status FROM payments WHERE status = ANY($1)` (payout only asks for `PAID`).
- `findPayment`: `SELECT id, status, merchant_id, ngn_amount_kobo, rate FROM payments WHERE id = $1`; `token_amount` is the sum of confirmed `chain_txs.amount` for the payment (or `received_amount`), and `tx_hashes` comes from `SELECT tx_hash FROM chain_txs WHERE payment_id = $1 ORDER BY block_number`.
- `updatePaymentStatus`: `UPDATE payments SET status = $2 WHERE id = $1` (still preceded by a state-machine transition).
- `insertPayout`: `INSERT INTO payouts (...) VALUES (...) ON CONFLICT (payment_id) DO NOTHING`.
- `insertLedgerEntry`: `INSERT INTO ledger_entries (...) VALUES (...) ON CONFLICT (payment_id, entry_type) DO NOTHING`.
- `insertReceipt`: `INSERT INTO receipts (...) VALUES (...) ON CONFLICT (payment_id) DO NOTHING`.
- `insertAuditEvent`: `INSERT INTO audit_events (...) VALUES (...)`.
- `PayoutTransactionRunner.run` wraps the callback in the existing db client's `transaction(...)`.
- The real `PayoutProvider` must treat `idempotencyKey` (the payment id) as a deduplication key, because the external payout cannot be rolled back if the surrounding DB transaction aborts.

7. Status notification adapter (read-only database scope; approval required):
- Add a PostgreSQL-backed `StatusNotifier` alongside the database client in `packages/database` (or approve an adapter under `apps/worker` that receives the database query client).
- Implementation: after a processor's transaction runner returns successfully, execute `SELECT pg_notify('payment_status', $1)` with the payment id as the bound payload, once for each state-machine transition committed by that transaction. Never issue it from inside the transaction callback. No database migration or new table is needed.

## Known issues
- The worker processors now depend on an injected `StatusNotifier`, but no PostgreSQL notifier is wired because the database client package is empty and read-only for this task. Consequently, these changes establish and test post-commit timing with a fake, but do not yet send a live PostgreSQL NOTIFY.
- No real db client, `payments`/`chain_txs`/`audit_events`/`ledger_entries`/`payouts`/`receipts` tables, or repositories exist yet, so `TransferProcessor`, `ConfirmProcessor`, `ExpireProcessor` and `PayoutProcessor` are not wired into the worker and only run against in-memory fakes in tests.
- `ScanJob`, `ConfirmJob`, `ExpireJob` and `PayoutJob` are not started from `apps/worker/src/main.ts` yet, because there is no real cursor table/repository, database repository or chain wiring in `main.ts`.
- Only `MockPayoutProvider` exists; there is no real `PayoutProvider` adapter or provider-side idempotency store.
- The live chain script was typechecked but not executed because no packages/chain/.env with RPC_URL/TOKEN_ADDRESS/TOKEN_DECIMALS exists in this workspace.

## Files created or changed so far
- packages/chain/src/types.ts (ChainTransfer/ChainAdapter shape)
- packages/chain/src/env.ts (new, Zod env validation)
- packages/chain/src/adapter.ts (ChainAdapter, log mapping, env factory)
- packages/chain/src/index.ts (RPC URL transport, env export)
- packages/chain/src/__tests__/adapter.test.ts (fake-log mapping tests)
- packages/chain/src/tests/base-sepolia.live.ts (new live script)
- packages/chain/src/tests/test.ts (deleted)
- packages/chain/src/tests/test-adapter.ts (deleted)
- packages/chain/src/tests/test-transfer.ts (deleted)
- packages/chain/package.json (zod dependency, test:live script)
- apps/worker/src/processors/cursor-repository.ts (new)
- apps/worker/src/processors/transfer-handler.ts (interface; no-op removed in phase 3)
- apps/worker/src/processors/scan-processor.ts (new)
- apps/worker/src/processors/clock.ts (new)
- apps/worker/src/processors/transfer-transaction.ts (new interfaces)
- apps/worker/src/processors/transfer-processor.ts (new TransferHandler implementation)
- apps/worker/src/processors/__tests__/in-memory-cursor-repository.ts (new)
- apps/worker/src/processors/__tests__/in-memory-transfer-transaction.ts (new)
- apps/worker/src/processors/__tests__/scan-processor.test.ts (new)
- apps/worker/src/processors/__tests__/transfer-processor.test.ts (new)
- apps/worker/src/jobs/scan-job.ts (new; now imports/re-exports `JobLogger`)
- apps/worker/src/jobs/__tests__/scan-job.test.ts (new)
- apps/worker/src/jobs/job-logger.ts (new)
- apps/worker/src/processors/confirm-transaction.ts (new interfaces)
- apps/worker/src/processors/confirm-processor.ts (new)
- apps/worker/src/processors/__tests__/in-memory-confirm-transaction.ts (new)
- apps/worker/src/processors/__tests__/confirm-processor.test.ts (new)
- apps/worker/src/jobs/confirm-job.ts (new)
- apps/worker/src/jobs/__tests__/confirm-job.test.ts (new)
- apps/worker/src/processors/transfer-transaction.ts (`AuditEvent.txHash` widened to `Hex | null`)
- apps/worker/src/processors/expire-transaction.ts (new interfaces)
- apps/worker/src/processors/expire-processor.ts (new)
- apps/worker/src/processors/__tests__/in-memory-expire-transaction.ts (new)
- apps/worker/src/processors/__tests__/expire-processor.test.ts (new)
- apps/worker/src/jobs/expire-job.ts (new)
- apps/worker/src/jobs/__tests__/expire-job.test.ts (new)
- apps/worker/src/processors/payout-provider.ts (new interfaces)
- apps/worker/src/processors/mock-payout-provider.ts (new)
- apps/worker/src/processors/payout-transaction.ts (new interfaces)
- apps/worker/src/processors/payout-processor.ts (new)
- apps/worker/src/processors/status-notifier.ts (new `StatusNotifier` interface)
- apps/worker/src/processors/__tests__/in-memory-status-notifier.ts (new test fake)
- apps/worker/src/processors/__tests__/in-memory-payout-transaction.ts (new)
- apps/worker/src/processors/__tests__/payout-processor.test.ts (new)
- apps/worker/src/processors/__tests__/confirm-processor.test.ts (post-commit notification assertion)
- apps/worker/src/processors/__tests__/expire-processor.test.ts (post-commit notification assertion)
- apps/worker/src/processors/__tests__/payout-processor.test.ts (one notification per committed transition assertion)
- apps/worker/src/processors/__tests__/transfer-processor.test.ts (exactly-once and rollback notification assertions)
- apps/worker/src/jobs/payout-job.ts (new)
- apps/worker/src/jobs/__tests__/payout-job.test.ts (new)
- apps/worker/package.json (@oya/chain, @oya/domain, @oya/contracts workspace dependencies)
- pnpm-lock.yaml
- apps/worker/PROGRESS.md

## Next step
After user approval to edit `packages/database` (or inject its eventual query client into apps/worker), implement the PostgreSQL `StatusNotifier` with bound `SELECT pg_notify('payment_status', $1)` after commit, wire it into worker construction, and then mark phase 7 complete.
