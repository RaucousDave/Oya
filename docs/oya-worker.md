# Oya Worker: Technical Deep-Dive Documentation

Prepared for the engineer implementing `apps/worker` in the Oya monorepo. This document is self-contained: it explains the product, the blockchain concepts, and then the worker's jobs, algorithms, data, and rules in detail.

## 1. Purpose of this document

The worker is the background program in Oya that watches the blockchain, confirms payments, expires stale payments, and runs mocked payouts. The reader is a frontend developer moving into full-stack work, so concepts are explained from first principles, and every section ends in something buildable.

Items marked **Assumption** are recommendations that the original system design does not state explicitly. They should be confirmed before implementation.

## 2. Oya in one page

Oya is a stablecoin payment gateway for Nigerian merchants. The MVP flow:

1. A merchant creates a payment request priced in naira (NGN).
2. Oya locks an NGN/USD rate for 60 seconds.
3. Oya derives a unique deposit address on Base Sepolia (a test blockchain) and shows it as a QR code.
4. The customer sends an ERC-20 test token to that address.
5. The worker detects the transfer and confirms it.
6. The API pushes live status updates to the browser.
7. A mocked payout produces a naira receipt.

The MVP does not custody private keys and does not make real naira payouts. Oya is a TypeScript monorepo and a modular monolith with three applications: `apps/web` (React + Vite), `apps/api` (NestJS), and `apps/worker` (NestJS standalone). Shared code lives in `packages/` (`contracts`, `domain`, `database`, `chain`, `config`, `test-utils`). PostgreSQL is the source of truth, accessed through Drizzle ORM.

## 3. Blockchain concepts the worker needs

**Blockchain.** A shared record book copied across thousands of computers. New entries are grouped into numbered pages called blocks. On Base, a new block appears every couple of seconds.

**Node.** A computer that holds a full copy of the chain. All nodes hold the same data, so the worker only needs to talk to one. Providers such as Alchemy and Infura run nodes; the worker connects via an RPC URL (for example the public `https://sepolia.base.org`).

**JSON-RPC.** The request format used to talk to a node (for example: give me the latest block number). The library `viem` wraps these calls in ordinary TypeScript functions, so the worker never builds raw RPC requests.

**Token and ERC-20.** The blockchain is the network; a token such as USDC is the money that moves on it. ERC-20 is the standard nearly all tokens follow, so one piece of code can read any ERC-20 token.

**Transfer event.** Whenever an ERC-20 token moves, its contract writes a note into the chain: from address A, to address B, amount X. Detecting payments means reading these Transfer events.

**Base units.** Blockchains store whole numbers only. USDC has 6 decimals, so 1 USDC is 1,000,000 base units and 50.5 USDC is 50,500,000. Some tokens use 18 decimals. The worker always handles token amounts as `bigint`, never as JavaScript `number`.

**Confirmations.** A transfer is in some block. Each block built on top makes it harder to reverse. Confirmations = latest block number minus the transfer's block number, plus 1. The MVP requires 2.

**Cursor.** A bookmark stored in Oya's own database: the last block the worker has already scanned. The blockchain does not know the worker exists, so the worker must remember where it stopped.

**Testnet.** Base Sepolia is a practice network. Its tokens are free and worthless, so nothing real is at risk.

**Extended public key (xpub).** The server uses an xpub to derive a unique deposit address for every payment. An xpub can generate addresses but cannot spend from them, so a compromised server cannot steal funds.

## 4. Where the worker fits

```text
Browser <-> React/Vite web <-> NestJS API <-> PostgreSQL
                                   ^              ^
                                   |              |
                             NestJS worker -------+
                                   |
                             Base Sepolia node (RPC)
```

The API serves short HTTP requests. The worker handles long-running work that must not block those requests: blockchain scanning, confirmation updates, expiry sweeps, and mocked payouts. The worker and API are separate processes that share only the database (and a notification channel, see section 13).

Only the Scan and Confirm jobs talk to the blockchain node. Expire and Payout only read and write PostgreSQL.

## 5. Responsibilities: the four jobs

| Job | Question it answers | Touches chain? |
| --- | --- | --- |
| Scan | Did new money arrive at any deposit address? | Yes |
| Confirm | Are detected transfers buried deep enough to trust? | Yes (latest block) |
| Expire | Did any payment run out of time? | No |
| Payout | Can a paid payment be settled and receipted? | No |

Each job runs repeatedly on its own timer (for example Scan every 3 seconds, Expire every 10 seconds). Jobs are independent of each other; they communicate only through database state.

## 6. Code layout inside apps/worker

```text
apps/worker/src/
  jobs/        scheduling: every N seconds, run a processor
  processors/  the logic: scan, confirm, expire, payout
  worker.module.ts   dependency composition
  main.ts            entry point
packages/chain/      ChainAdapter + Base Sepolia (viem) implementation
packages/domain/     payment state machine + money rules
packages/database/   Drizzle schema, client, repositories
```

Jobs are thin: they only decide when to run. Processors hold the logic and receive their dependencies (chain adapter, repositories, clock) as arguments. This makes processors easy to test with fake chain data from `packages/test-utils`, with no real blockchain needed.

## 7. Interfaces the worker depends on

```ts
interface ChainAdapter {
  getLatestBlock(): Promise<bigint>;
  getTransfersInRange(fromBlock: bigint, toBlock: bigint): Promise<ChainTransfer[]>;
  getConfirmations(blockNumber: bigint): Promise<number>;
}

interface RateProvider { getNgnUsdRate(): Promise<DecimalString>; }
interface PayoutProvider { createPayout(input: PayoutInput): Promise<PayoutResult>; }
```

The MVP uses a fixed-rate provider and a mock payout provider. Production adapters can replace them without touching the state machine. All blockchain-specific code (viem, log parsing) is hidden behind `ChainAdapter`, so processors never import viem directly.

Inside `getTransfersInRange`, the Base Sepolia adapter uses viem's `getLogs` (or `getContractEvents`) on the token contract for the ERC-20 `Transfer` event, then `parseEventLogs` to decode the results into `ChainTransfer` objects: transaction hash, block number, to address, and amount as `bigint`.

## 8. Job 1: Scan

### Goal

Find every token transfer sent to one of Oya's deposit addresses, record it, and advance the payment's state.

### The cursor

The cursor is one row in PostgreSQL, keyed by chain. **Assumption:** a small table such as `chain_cursor(id text primary key, last_block bigint)` with id `base-sepolia`. The design requires a stored block cursor but does not name the table.

### Algorithm

1. Read `last_block` from the database.
2. Ask the node for the latest block number.
3. If latest is not greater than the cursor, stop and wait for the next tick.
4. Set `from = cursor + 1` and `to = min(latest, from + CHUNK - 1)`. Use a chunk of about 500 blocks; nodes reject very large ranges and the exact limit depends on the RPC provider.
5. Fetch Transfer events for that range through the chain adapter.
6. For each transfer, run the transfer-processing routine (section 9).
7. Save `to` as the new cursor.
8. Repeat until the cursor reaches the latest block.

```ts
const cursor = await cursors.get('base-sepolia');
const latest = await chain.getLatestBlock();
let from = cursor + 1n;
while (from <= latest) {
  const to = min(latest, from + CHUNK - 1n);
  const transfers = await chain.getTransfersInRange(from, to);
  for (const t of transfers) await processTransfer(t);
  await cursors.set('base-sepolia', to);
  from = to + 1n;
}
```

### Why the cursor lives in the database

Memory is lost on a crash or restart. With the cursor in PostgreSQL, a worker that was down for an hour restarts, reads the saved cursor, and backfills every missed block in order. Nothing is skipped.

### First run

With no cursor row, initialise it to the current latest block (or the block where the test token was deployed). Never start from block 0, which would scan the entire chain history.

### Edge cases

- **Crash between processing and saving the cursor.** The same blocks will be scanned again. This is safe only because transfer processing is idempotent (unique `tx_hash`).
- **RPC errors or rate limits.** Catch, log, and retry on the next tick with the same cursor. Consider shrinking the chunk size when a range is rejected.
- **Transfers to unknown addresses.** Most transfers on the token contract are unrelated to Oya. Ignore any transfer whose recipient is not a deposit address of an Oya payment.
- **Efficiency.** Loading the set of active deposit addresses once per chunk (instead of one query per transfer) keeps scanning fast.

## 9. Processing one transfer

For each transfer to a known deposit address, run the following inside **one database transaction**:

1. Find the payment by deposit address. If none exists, ignore the transfer.
2. Insert a row into `chain_txs`. `tx_hash` is unique, so use insert-on-conflict-do-nothing; if the row already exists, stop. This prevents double credit.
3. Add the transfer amount (base units, `bigint`) to the payment's received total.
4. Ask the domain state machine for the transition (for example AWAITING\_PAYMENT to CONFIRMING). Never write the status directly.
5. Insert an `audit_events` row: old status, new status, reason, metadata, timestamp.
6. After the transaction commits, signal the API that the payment changed (section 13).

The transaction guarantees that the amount, the status change, and the audit log either all succeed or none do. A payment can never end up with money counted but the status unchanged, or a status change with no log.

If a payment is already EXPIRED or in a state that does not accept transfers, the state machine refuses the transition. **Assumption:** the transfer should still be recorded in `chain_txs` and flagged for review rather than silently dropped, since real tokens were sent.

## 10. Job 2: Confirm

### Goal

Decide when detected transfers are final enough to trust, then settle the payment's amount outcome.

### Algorithm

1. Fetch `chain_txs` rows with fewer than the required confirmations (2 in the MVP).
2. Get the latest block from the chain adapter.
3. For each row compute `confirmations = latest - blockNumber + 1` and store it.
4. Once a payment has enough confirmed transfers, sum the confirmed amounts (in base units) and compare with the required amount:
   - Total equal to the requirement: PAID.
   - Total below: UNDERPAID.
   - Total above: OVERPAID, with an extra ledger entry for the surplus.
5. Write ledger entries and an audit event for every transition, in one transaction.

### Top-ups

An underpaid payment can receive further transfers. The required amount and all valid received amounts are summed, so UNDERPAID can move back to CONFIRMING and then to PAID. A payment may therefore own several confirmed chain transactions.

**Assumption:** OVERPAID is treated as a successful payment with a surplus ledger entry, and continues to payout. The design lists OVERPAID as a state and a ledger entry for overpayment but does not define its onward path.

## 11. Job 3: Expire

A timer-driven database query, with no chain access.

- A payment still in AWAITING\_PAYMENT whose rate lock has passed (60 seconds after creation) becomes EXPIRED.
- A payment in UNDERPAID gets a top-up grace period of 5 minutes after the rate expiry. Only after that window does it expire.
- Every expiry is a state-machine transition with an audit event.

Use the database clock or a single injected clock, and be careful of a race with Scan: a transfer detected just before expiry must win. Re-check the status inside the expiry transaction.

## 12. Job 4: Payout

For each PAID payment:

1. Transition PAID to PAYOUT\_PENDING.
2. Call `PayoutProvider.createPayout()` (the mock in the MVP).
3. Write the `payouts` row (one per payment: NGN amount, status, provider, provider reference).
4. Write ledger entries for merchant balance and payout.
5. Write the `receipts` snapshot (merchant, NGN amount, token amount, rate, transaction hashes, timestamp). One receipt per completed payment.
6. Transition to SETTLED and write the audit event.

Database constraints enforce one payout and one receipt per payment, so a retried payout job cannot create duplicates. NGN amounts are integers in kobo.

## 13. Telling the API something changed

The API streams updates to browsers over Server-Sent Events at `GET /payments/:paymentId/events`. The worker and the API are separate processes, so an in-memory event emitter inside the API cannot see worker-side changes. The design describes an in-memory emitter as acceptable for a single-instance MVP, but that only works if the worker's changes reach the API process some other way.

**Recommendation:** after committing a status change, the worker sends a PostgreSQL `NOTIFY` on a channel such as `payment_status`, with the payment id. The API holds a `LISTEN` connection and forwards the change to the open SSE streams. Redis pub/sub is the alternative if multiple instances are needed later.

**Deployment note.** The design suggests Vercel for web and API, and Railway or Fly for the worker. Long-lived SSE connections and persistent LISTEN connections fit poorly with serverless functions. Hosting the API alongside the worker on Railway or Fly avoids this.

## 14. The payment state machine

```text
CREATED > AWAITING_PAYMENT > CONFIRMING > PAID > PAYOUT_PENDING > SETTLED
AWAITING_PAYMENT > EXPIRED
CONFIRMING > UNDERPAID | OVERPAID | WRONG_NETWORK_FLAGGED
UNDERPAID > CONFIRMING > PAID   (top-up)
```

All transitions are validated by one module in `packages/domain`. The worker calls it and never assigns a status itself. This keeps the rules in one place and prevents impossible jumps such as EXPIRED to PAID.

Which job causes which transition:

| Transition | Caused by |
| --- | --- |
| AWAITING\_PAYMENT to CONFIRMING | Scan (transfer detected) |
| CONFIRMING to PAID / UNDERPAID / OVERPAID | Confirm |
| UNDERPAID to CONFIRMING | Scan (top-up detected) |
| AWAITING\_PAYMENT or UNDERPAID to EXPIRED | Expire |
| PAID to PAYOUT\_PENDING to SETTLED | Payout |

`WRONG_NETWORK_FLAGGED` is listed in the design but its detection is not specified. A worker scanning only Base Sepolia cannot see transfers on other networks, so this likely needs a separate mechanism (for example a manual or API-side flag). Treat it as an open question.

## 15. Data the worker reads and writes

| Table | Worker use |
| --- | --- |
| payments | Look up by deposit address; update received total and status |
| chain\_txs | Insert detected transfers; update confirmations. `tx_hash` unique |
| ledger\_entries | Immutable financial events; idempotent writes inside transactions |
| payouts | One mock payout per payment |
| receipts | One receipt per completed payment |
| audit\_events | One row for every status change |
| chain\_cursor (assumed) | Last scanned block per chain |

Money rules: NGN in kobo (integers); token amounts in base units (`bigint` in code, `numeric` or text in the database); rates as fixed-precision decimal strings. No floating-point arithmetic anywhere in money paths.

## 16. Correctness rules

1. **Idempotency.** Every processor must be safe to run twice on the same data. Unique constraints and insert-on-conflict-do-nothing do most of the work.
2. **Transactions.** Amount changes, status changes, ledger entries, and audit events happen together.
3. **State machine only.** No direct status writes.
4. **No floats.** `bigint` for tokens, integer kobo for naira, decimal strings for rates.
5. **Resumability.** The cursor allows restart and backfill after downtime.
6. **Single scanner.** **Assumption:** run exactly one worker instance for the MVP. If you ever run more than one, protect the scan loop with a database advisory lock, and use `SELECT ... FOR UPDATE SKIP LOCKED` for the confirm and payout queues.
7. **No private keys.** The worker never holds or needs deposit private keys.

## 17. Error handling and resilience

- A failed tick must never crash the process. Catch, log with context (job name, block range, payment id), and continue on the next tick.
- Make each tick short and bounded (one chunk per scan tick if needed) so that slow RPC calls cannot pile up. Do not start a new run of a job while the previous run is still active.
- Use timeouts on every RPC call and retry with backoff on transient failures.
- **Reorgs.** A chain reorganisation can remove a block that was already scanned. The 2-confirmation rule limits exposure on the testnet; for production, consider re-scanning a small trailing window (for example the last few blocks) on each tick, which idempotency makes safe.
- Log the cursor position and chain lag (latest minus cursor) so that a stuck scanner is visible.

## 18. Testing strategy

- **Domain tests (Vitest).** Exhaustively test the state machine: allowed and refused transitions, top-ups, expiry timing.
- **Processor tests.** Feed processors a fake `ChainAdapter` from `packages/test-utils` that returns scripted transfers and block numbers. Assert database results: payment status, received total, `chain_txs` rows, audit events.
- **Idempotency tests.** Run the same scan range twice; assert nothing is double-counted.
- **Edge-case tests.** Underpay then top-up; overpay; transfer after expiry; crash between processing and cursor save; unknown recipient address.
- **Integration test.** Optionally run once against Base Sepolia with a real test token and a faucet-funded wallet.

## 19. Configuration

Parsed and validated in `packages/config` (Zod). Likely values: database URL, RPC URL, token contract address and decimals, required confirmations (2), scan chunk size (about 500), job intervals, rate-lock seconds (60), top-up grace seconds (300), and the xpub used by the API for address derivation.

## 20. Suggested build order

1. Connect viem and print the latest block number.
2. Fetch Transfer events for the test token over a block range and log them.
3. Add the database cursor and the chunked scan loop.
4. Match transfers to payments; save `chain_txs`, update the received total, apply the state transition, write the audit event, all in one transaction.
5. Add the Confirm job.
6. Add the Expire job.
7. Add the Payout job with the mock provider, ledger entries, and receipt.
8. Add NOTIFY so the API can push live updates.
9. Add logging, retries, and the edge-case tests.

## 21. Worked example: one payment, end to end

A merchant requests 50,000 NGN. Assume the locked rate gives a required amount of 33 USDC = 33,000,000 base units.

| Time | Event | Result |
| --- | --- | --- |
| 0:00 | API creates the payment and a deposit address | Status AWAITING\_PAYMENT; rate lock ends at 0:60 |
| 0:20 | Customer sends 33 USDC; included in block 1052 | Not yet seen |
| 0:23 | Scan tick: cursor 1050, latest 1054; reads blocks 1051 to 1054 | Transfer found; `chain_txs` row inserted; received 33,000,000; status CONFIRMING; audit event written; cursor saved as 1054 |
| 0:27 | Confirm tick: latest 1058 | Confirmations = 1058 - 1052 + 1 = 7, at least 2; totals match; status PAID |
| 0:30 | Payout tick | PAYOUT\_PENDING; mock payout; ledger entries; receipt written; SETTLED |
| throughout | Each commit sends a NOTIFY | Browser shows each status change live |

## 22. Glossary

- **Base Sepolia:** the test version of the Base blockchain.
- **Block:** one numbered batch of blockchain records.
- **bigint:** JavaScript type for exact whole numbers of any size; written with a trailing `n`.
- **Chain adapter:** Oya's interface that hides blockchain-specific code.
- **Confirmation:** a block built on top of the one containing a transfer.
- **Cursor:** the stored number of the last block scanned.
- **Deposit address:** unique per-payment address derived from the xpub.
- **ERC-20:** the standard token format on Ethereum-compatible chains.
- **Idempotent:** safe to repeat; repeating gives the same result.
- **Kobo:** one hundredth of a naira; the unit NGN is stored in.
- **Node:** a computer holding a copy of the blockchain.
- **RPC URL:** the web address of the node the worker queries.
- **SSE:** Server-Sent Events; a one-way live update stream from server to browser.
- **viem:** TypeScript library for talking to the blockchain.
- **xpub:** extended public key; can derive addresses but cannot spend.

## 23. Open questions

1. How is WRONG\_NETWORK\_FLAGGED detected, and by which component?
2. What exactly happens after OVERPAID: refund, credit the merchant, or just record the surplus?
3. How are late transfers (after EXPIRED) handled for the merchant and customer?
4. Which RPC provider and what chunk limit apply?
5. Which mechanism notifies the API: PostgreSQL LISTEN/NOTIFY or Redis?
6. Where will the worker and API be hosted, given the serverless concerns in section 13?
