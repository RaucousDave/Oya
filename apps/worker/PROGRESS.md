# Worker progress

Last updated by: opencode (big-pickle), 2026-11-11
Current phase: 2

## Phases (mark [x] only when typecheck and tests pass)
- [x] 1. packages/chain: ChainAdapter (viem, Base Sepolia). Script printing latest block and Transfer events for the last 50 blocks. Vitest tests for log-to-ChainTransfer mapping using fake logs. No DB.
- [x] 2. Scan processor and cursor. CursorRepository interface with an in-memory fake (real table goes under "Needs approval"). Chunked loop, scan job on a timer. Tests: normal scan, first run, restart resumes from cursor, same range twice does not double-count.
- [ ] 3. Transfer processing transaction. Tests: duplicate tx_hash, unknown address, refused transition, top-up.
- [ ] 4. Confirm job. Tests: exact, underpaid, overpaid, top-up, confirmations below 2.
- [ ] 5. Expire job. Tests: expiry at rate lock, 5-minute top-up grace, transfer arriving just before expiry wins.
- [ ] 6. Payout job with the mock provider, ledger entries, payout row, receipt. Tests: retry creates no duplicates.
- [ ] 7. Postgres NOTIFY after each committed status change.

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
- `TransferHandler` is an interface with a no-op implementation for now; phase 3 will replace it with the real transfer-processing handler.
- `ScanJob` owns the timer and the overlap guard (synchronous `running` flag set before the first await). It catches and logs failed ticks through an injected `JobLogger`; no Nest dependency was added.
- Added `@oya/chain` as a workspace dependency of `@oya/worker` for the ChainAdapter/ChainTransfer types.

## Needs approval
Add a cursor table to the read-only database package (schema is not touched here). Proposed exact change:
```sql
CREATE TABLE chain_cursors (
  chain text PRIMARY KEY,
  last_scanned_block bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
Repository implementation:
- `getCursor(chain)`: `SELECT last_scanned_block FROM chain_cursors WHERE chain = $1` -> `bigint | null`.
- `saveCursor(chain, blockNumber)`: `INSERT INTO chain_cursors (chain, last_scanned_block) VALUES ($1, $2) ON CONFLICT (chain) DO UPDATE SET last_scanned_block = EXCLUDED.last_scanned_block, updated_at = now()`.

## Known issues
- `ScanJob` is not started from `apps/worker/src/main.ts` yet, because there is no real cursor table/repository or chain wiring in `main.ts`. The timer and processor are built and tested.
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
- apps/worker/src/processors/transfer-handler.ts (new)
- apps/worker/src/processors/scan-processor.ts (new)
- apps/worker/src/processors/__tests__/in-memory-cursor-repository.ts (new)
- apps/worker/src/processors/__tests__/scan-processor.test.ts (new)
- apps/worker/src/jobs/scan-job.ts (new)
- apps/worker/src/jobs/__tests__/scan-job.test.ts (new)
- apps/worker/package.json (@oya/chain workspace dependency)
- pnpm-lock.yaml
- apps/worker/PROGRESS.md

## Next step
Start phase 3: replace `noopTransferHandler` with a `TransferHandler` that processes each transfer in one DB transaction (find payment by deposit address, insert chain_txs with ON CONFLICT DO NOTHING, add received total, state-machine transition, audit event), using in-memory repository fakes and the tests listed for phase 3.
