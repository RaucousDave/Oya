# Worker progress

Last updated by: opencode (big-pickle), 2026-11-11
Current phase: 1

## Phases (mark [x] only when typecheck and tests pass)
- [x] 1. packages/chain: ChainAdapter (viem, Base Sepolia). Script printing latest block and Transfer events for the last 50 blocks. Vitest tests for log-to-ChainTransfer mapping using fake logs. No DB.
- [ ] 2. Scan processor and cursor. CursorRepository interface with an in-memory fake (real table goes under "Needs approval"). Chunked loop, scan job on a timer. Tests: normal scan, first run, restart resumes from cursor, same range twice does not double-count.
- [ ] 3. Transfer processing transaction. Tests: duplicate tx_hash, unknown address, refused transition, top-up.
- [ ] 4. Confirm job. Tests: exact, underpaid, overpaid, top-up, confirmations below 2.
- [ ] 5. Expire job. Tests: expiry at rate lock, 5-minute top-up grace, transfer arriving just before expiry wins.
- [ ] 6. Payout job with the mock provider, ledger entries, payout row, receipt. Tests: retry creates no duplicates.
- [ ] 7. Postgres NOTIFY after each committed status change.

## Commands
- Typecheck: `pnpm --filter @oya/chain typecheck` (also `pnpm --filter @oya/worker typecheck`)
- Test: `pnpm --filter @oya/chain test`
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

## Needs approval
(none)

## Known issues
- `pnpm --filter @oya/worker test` exits 1 with "No test files found, exiting with code 1". Expected until phase 2 adds worker tests; worker typecheck passes.
- The live script was typechecked but not executed because no packages/chain/.env with RPC_URL/TOKEN_ADDRESS/TOKEN_DECIMALS exists in this workspace.

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
- pnpm-lock.yaml (zod)
- apps/worker/PROGRESS.md

## Next step
Start phase 2: implement the Scan processor and cursor using a CursorRepository interface with an in-memory fake; add the scan job timer and the tests listed for phase 2.
