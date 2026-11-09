# Oya MVP Todo

## Phase 0: Project foundation

- [ ] Initialize pnpm workspace and TypeScript configuration.
- [ ] Create `apps/web`, `apps/api`, and `apps/worker`.
- [ ] Create shared packages: `contracts`, `domain`, `database`, `chain`, `config`, and `test-utils`.
- [ ] Add linting, formatting, and Vitest configuration.
- [ ] Add environment validation and `.env.example`.
- [ ] Configure PostgreSQL through a local installation or hosted development database.

## Phase 1: Database and domain

- [ ] Define Drizzle tables for merchants, payments, chain transactions, ledger entries, payouts, receipts, and audit events.
- [ ] Add indexes, foreign keys, unique transaction hash constraint, and one-payout/one-receipt constraints.
- [ ] Generate and run the initial migration.
- [ ] Define shared payment status and event types.
- [ ] Implement the payment state machine.
- [ ] Implement money and token base-unit helpers.
- [ ] Implement expiry and five-minute top-up grace-period rules.
- [ ] Add unit tests for every valid and invalid state transition.
- [ ] Add tests for underpayment, top-up, overpayment, expiry, and duplicate transactions.

## Phase 2: Blockchain integration

- [ ] Configure viem for Base Sepolia.
- [ ] Implement the `ChainAdapter` interface.
- [ ] Implement ERC-20 transfer event parsing.
- [ ] Implement extended-public-key deposit address derivation.
- [ ] Add a stored block cursor for watcher recovery.
- [ ] Add chain adapter tests with mocked RPC responses.
- [ ] Configure the demo token contract address and token decimals.

## Phase 3: NestJS API

- [ ] Implement merchant authentication/session handling.
- [ ] Implement payment creation endpoint.
- [ ] Lock and store the exchange rate for 60 seconds.
- [ ] Generate payment links and QR payloads.
- [ ] Implement payment detail endpoint.
- [ ] Implement merchant payment list, filters, and totals.
- [ ] Implement receipt retrieval/download endpoint.
- [ ] Implement SSE payment events endpoint.
- [ ] Add API validation and consistent error responses.

## Phase 4: Worker

- [ ] Implement block scanning job.
- [ ] Match transfers to payment deposit addresses.
- [ ] Deduplicate transactions by hash.
- [ ] Update confirmations and transition payments safely.
- [ ] Implement underpayment and top-up processing.
- [ ] Implement overpayment handling.
- [ ] Implement expiry sweep.
- [ ] Implement mocked payout processor.
- [ ] Write ledger entries atomically with state changes.
- [ ] Verify restart/backfill behavior.

## Phase 5: React frontend

- [ ] Build merchant login screen.
- [ ] Build payment creation form.
- [ ] Build payment QR/countdown screen.
- [ ] Build customer payment status screen.
- [ ] Build merchant dashboard and filters.
- [ ] Build payment detail and receipt views.
- [ ] Display underpayment remaining amount and top-up instructions.
- [ ] Display overpayment and wrong-network warnings.
- [ ] Connect SSE updates to the payment UI.
- [ ] Add responsive styling and loading/error/empty states.

## Phase 6: Verification and demo

- [ ] Run a complete happy-path payment on Base Sepolia.
- [ ] Demonstrate an underpayment followed by a top-up.
- [ ] Demonstrate an expired payment or overpayment.
- [ ] Verify receipt contents and transaction hash.
- [ ] Verify duplicate transaction detection.
- [ ] Verify worker restart and block backfill.
- [ ] Add end-to-end test for payment creation through settlement.
- [ ] Document local setup and demo steps.
- [ ] Document production limitations and regulatory assumptions honestly.

## Deferred after MVP

- [ ] Real NGN off-ramp provider adapter.
- [ ] Live rate provider adapter.
- [ ] Additional networks and tokens.
- [ ] Email/WhatsApp notifications.
- [ ] Merchant exports and reconciliation reports.
- [ ] Production custody and key-management review.
- [ ] KYC/AML and licensed-partner workflows.
