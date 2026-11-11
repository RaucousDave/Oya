# Oya worker: agent rules

Applies to apps/worker and packages/chain. These rules override your defaults. The user's explicit instruction in the current task overrides this file for that task only; if you follow such an exception, record it in PROGRESS.md.

## 1. Start of every session (in this order)
1. Read this file.
2. Read apps/worker/PROGRESS.md fully.
3. Run `git status` and `git diff --stat`. Uncommitted changes you did not make belong to a previous agent. Continue from them. Never revert, stash, reset or delete them.
4. Verify the claimed state: run typecheck and tests before building on earlier work. If the notes and the code disagree, the code wins; fix the notes.
5. Read only the files your task needs. Do not scan the whole repo.

## 2. Scope
- Editable: apps/worker/**, packages/chain/**, and NEW files only in packages/test-utils (fakes and fixtures for worker tests).
- Read-only: everything else, including apps/api, apps/web, packages/domain, packages/database, packages/contracts, packages/config, drizzle/, and existing files in packages/test-utils.
- If the task needs a change to read-only code (new table or column, new state-machine transition, shared type, config key): do NOT make it. Write the exact proposed change under "Needs approval" in PROGRESS.md, build against an interface with an in-memory fake, and tell the user. Edit read-only code only if the user approves it in the current task.
- Worker env vars are parsed with Zod inside apps/worker. Do not edit packages/config.

## 3. Architecture (do not deviate)
- The worker is a NestJS standalone app running four jobs: Scan, Confirm, Expire, Payout. Only Scan and Confirm use the chain (Base Sepolia).
- apps/worker/src/jobs: schedulers only, no business logic.
- apps/worker/src/processors: all logic. Dependencies (ChainAdapter, repositories, clock) are passed in, never imported as singletons, so processors are testable with fakes.
- All viem code lives in packages/chain behind ChainAdapter. Processors and jobs never import viem.
- ChainAdapter: getLatestBlock(): Promise<bigint>; getTransfersInRange(from: bigint, to: bigint): Promise<ChainTransfer[]>; getConfirmations(blockNumber: bigint): Promise<number>.
- ChainTransfer: { txHash, blockNumber: bigint, to: address, amount: bigint }.
- Prefer existing repo patterns, utilities and the existing db client over creating new ones. Style and conventions: the repo wins.

## 3a. Domain facts
- Rate lock 60s. Top-up grace 5 min after rate expiry. Confirmations required: 2.
- confirmations = latestBlock - txBlock + 1.
- Statuses: CREATED, AWAITING_PAYMENT, CONFIRMING, PAID, PAYOUT_PENDING, SETTLED, EXPIRED, UNDERPAID, OVERPAID, WRONG_NETWORK_FLAGGED. UNDERPAID can top up back to CONFIRMING then PAID.

## 4. Correctness rules (non-negotiable)
- Money: token amounts are bigint (base units); NGN is integer kobo; rates are decimal strings. No floats. Never call Number() on a token amount. Convert to and from DB types only at the repository boundary.
- Status changes go ONLY through the state machine in packages/domain. Never assign or write a status directly. If a needed transition does not exist, follow the "Needs approval" rule.
- Processing a transfer is ONE DB transaction: find the payment by deposit address (ignore if none) -> insert chain_txs with ON CONFLICT (tx_hash) DO NOTHING (stop if it already existed) -> add the amount to the received total -> state-machine transition -> insert audit_events row. Any failure rolls back everything.
- Only count Transfer events from the configured TOKEN_ADDRESS. Compare addresses case-insensitively (normalise before comparing).
- Every processor is idempotent and safe to retry. Running it twice on the same data must not change the result.
- Scan cursor: stored in the DB, one row per chain. Advance it only AFTER every transfer in the chunk was processed successfully. Never advance past a failed chunk. Chunks are at most SCAN_CHUNK_SIZE blocks (default 500). First run with no cursor starts at the current latest block.
- A failed tick is caught and logged with context (job, block range, payment id), never crashes the process, and never swallows the error silently. A job run must not start while the previous run of the same job is active.
- Use the injected clock for time. No Date.now() inside processors.
- Run exactly one worker instance; do not add multi-instance locking unless asked.

## 5. Testing
- Unit tests (Vitest) use fakes. No real network or RPC calls in tests that run by default.
- Any script or test that hits Base Sepolia is clearly named (for example *.live.ts) and is never part of the default test command.
- Every processor ships with tests for: normal case, duplicate or repeated input, unknown address, refused transition, and the money edge cases relevant to it (exact, underpaid, overpaid, top-up).
- Never skip, delete or weaken a test or assertion to make it pass. Fix the code.

## 6. Quality
- No `any`, `@ts-ignore` or `@ts-expect-error`. No console.log in src (use the Nest Logger; scripts may print).
- No hardcoded RPC URLs, keys or addresses. Never print or commit secrets. Do not commit .env files.
- Add a dependency only if truly needed (viem is approved). Name any new dependency in PROGRESS.md.

## 7. Git and safety
- Do not commit, push, create branches, rebase or amend unless the user says so. Leave work in the working tree.
- No destructive commands (rm -rf outside build output, DROP, TRUNCATE, git reset --hard, git clean).
- Use only the local development database. Never run migrations or schema pushes unless the user approves it in the current task.
- Assume one agent works at a time. If git status shows changes you cannot explain from PROGRESS.md, stop and ask.

## 8. Handoff protocol (critical)
- Update PROGRESS.md after each completed unit of work AND before ending, even if you are unfinished, blocked or out of budget. Do it before the final report, because you may be cut off.
- Mark an item done only when typecheck and tests pass. If something is broken or half-done, say so under "Known issues", with the exact failing command and error.
- Record every decision with its reason under "Decisions". Do not delete earlier decisions; add a new entry that supersedes them.
- Always fill "Next step" with one concrete instruction a fresh agent can follow.
- Never claim something works without running it.

## 9. Working style (save tokens)
- Do only the task named, then stop. Do not start the next phase.
- No README or docs files, no speculative features, no extra abstractions.
- Do not re-print files you did not change. Do not re-explain this file.
- Ask a question only if truly blocked. Otherwise choose the simplest option and record it as a decision.
- Final report: under 10 lines (files changed, how to run, decisions, blockers).

## 10. Commands
- Typecheck: <fill in>
- Test: <fill in>
- Run worker: <fill in>
If a command is not filled in, read it from package.json and record it here in PROGRESS.md. Do not guess.

## 11. Design reference
docs/oya-worker.md. Read only the section for the current task. Its "Assumption" items are recommendations, not facts; if the user has decided otherwise, follow the user. If the repo differs from the doc, the repo wins.