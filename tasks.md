# Oya MVP Tasks

Tasks are split by feature and file boundary so they can be claimed independently. Before starting, claim the task ID in the team channel or issue tracker. If a task needs to change a shared contract, finish that contract change first and notify the owners of its consumers.

## Task format

Each task includes:

- **Files:** the intended ownership boundary
- **Depends on:** work that must land first
- **Done when:** the acceptance criteria for the task

Avoid drive-by refactors. If implementation requires files outside the listed boundary, call that out in the PR before changing them.

## Shared ownership rules

- `packages/contracts` and `packages/domain` are shared foundations. Consumer changes should follow their interfaces, not redefine them.
- `packages/database` owns persistence shape and repository behavior. Business transitions belong in the domain package.
- `packages/chain` owns chain-specific details. The worker should use its interfaces instead of importing viem directly.
- `apps/api` owns HTTP and SSE orchestration. It should not contain duplicate payment rules.
- `apps/worker` owns background processing and settlement. It should not change web or API presentation.
- `apps/web/src/pages` owns page composition. `apps/web/src/components` owns reusable visual pieces.
- Add tests beside the package they verify.

## Recommended five-person split

This split follows the runtime path and keeps each person responsible for a coherent area. It also lets the API owner build an endpoint from request to database response instead of waiting for another person to finish persistence.

### Person 1: Blockchain integration

- **Owns:** `packages/chain`, chain-specific configuration, chain adapter tests
- **Tasks:** `OYA-030` through `OYA-034`
- **Produces:** a chain-neutral adapter that can read blocks, parse ERC-20 transfers, count confirmations, and derive deposit addresses
- **Does not edit:** `apps/worker`, `apps/api`, or `apps/web`

### Person 2: Worker and settlement

- **Owns:** `apps/worker/src` and worker tests
- **Tasks:** `OYA-050` through `OYA-057`
- **Produces:** scanning, matching, confirmation, edge-case handling, expiry, mocked payout, ledger writes, and recovery behavior
- **Depends on:** Person 1's `ChainAdapter` interface and Person 3's database repository interface
- **Does not edit:** chain implementation, API controllers, or web code

### Person 3: API and persistence vertical slice

- **Owns:** `apps/api/src` and `packages/database`
- **Tasks:** `OYA-020` through `OYA-024`, `OYA-040` through `OYA-049`
- **Produces:** mounted API routes that validate input, query/write the database, apply domain rules, and return documented output fixtures
- **Important:** this person owns database schema and repositories so each API route can be built end to end
- **Does not edit:** worker processing or web page components

### Person 4: Merchant web experience

- **Owns:** merchant-facing web pages and features
- **Tasks:** `OYA-060`, `OYA-061`, `OYA-062`, `OYA-064`, `OYA-065`, `OYA-067`, plus the merchant parts of `OYA-068`
- **Produces:** login, payment creation, dashboard, merchant payment detail, receipt, and navigation flows
- **Does not edit:** customer payment components or shared styles without coordination

### Person 5: Customer web experience and shared presentation

- **Owns:** customer payment page, landing page, shared web routing, shared components, and styles
- **Tasks:** `OYA-005`, `OYA-059`, `OYA-063`, `OYA-066`, `OYA-068`, `OYA-070` through `OYA-073`
- **Produces:** customer QR/payment status flow, public landing page, route shell, shared visual primitives, responsive behavior, and theme QA
- **Does not edit:** merchant feature internals without coordination

### Shared foundation handoff

The remaining foundation work should be completed before parallel implementation:

- Person 1 or the team lead completes `OYA-001` through `OYA-015`.
- The team agrees on contracts before API, worker, and web owners build consumers.
- Person 3 publishes `OYA-049` fixtures early so both web owners can work without waiting for live backend behavior.
- Only the owner of `packages/contracts` and `packages/domain` changes shared payment types and transition rules. All other owners request changes through a small, reviewed PR.

### Collision rules

- Person 1 may change `packages/chain`; Person 2 consumes it.
- Person 2 may change `apps/worker`; Person 3 exposes worker results through the API.
- Person 3 may change `packages/database` and `apps/api`; web owners consume the documented routes.
- Person 4 and Person 5 must use separate feature folders and avoid editing the same page component.
- Shared UI changes by Person 5 should be additive and announced before Person 4 adopts them.

## Route and output conventions

The route shell should be mounted once and extended through route modules. Do not add one-off pathname checks inside page components.

### Public web routes

| Method | Route | Expected output |
|---|---|---|
| `GET` | `/` | Public Oya landing page with CTA links to merchant and payment flows |
| `GET` | `/login` | Merchant login form, loading state, validation state, and redirect target |
| `GET` | `/payments/new` | Authenticated merchant payment creation form |
| `GET` | `/pay/:paymentId` | Customer payment page with amount, QR, countdown, and live status |
| `GET` | `/dashboard` | Authenticated merchant payment list, filters, and totals |
| `GET` | `/dashboard/payments/:paymentId` | Merchant payment detail and receipt actions |

### API routes

| Method | Route | Expected output |
|---|---|---|
| `POST` | `/auth/login` | Session or access token plus merchant summary |
| `POST` | `/payments` | Payment ID, payment URL, QR payload, locked rate, token amount, expiry, and deposit address |
| `GET` | `/payments/:paymentId` | Customer-safe payment amount, token, network, QR data, expiry, and status |
| `GET` | `/payments/:paymentId/events` | SSE stream of status changes and payment data updates |
| `GET` | `/merchant/payments` | Merchant-scoped payments, status/date filters, and totals |
| `GET` | `/merchant/payments/:paymentId` | Merchant detail, audit status, chain transactions, payout, and ledger summary |
| `GET` | `/merchant/payments/:paymentId/receipt` | Receipt data or downloadable receipt response |

All API success and error responses should use `packages/contracts`. Every route task below should add at least one success test and one meaningful failure test.

## A. Project foundation

### OYA-005 Web route shell

- **Files:** `apps/web/src/main.tsx`, `apps/web/src/routes`, route configuration files
- **Depends on:** OYA-001
- **Work:** Mount the web router once and register `/`, `/login`, `/payments/new`, `/pay/:paymentId`, `/dashboard`, and `/dashboard/payments/:paymentId`.
- **Done when:** each route renders a page or explicit placeholder, unknown routes render a not-found state, and page components do not inspect `window.location.pathname` directly.

### OYA-001 Workspace and package verification

- **Files:** `package.json`, `pnpm-workspace.yaml`, package manifests, `tsconfig*.json`
- **Depends on:** none
- **Work:** Verify the pnpm workspace, TypeScript project references, package names, and development scripts from a clean checkout.
- **Done when:** `pnpm install`, package typechecks, and the web/API/worker development commands are documented and reproducible.

### OYA-002 Developer tooling

- **Files:** root config files, package scripts, optional `.prettierrc`, Vitest config
- **Depends on:** OYA-001
- **Work:** Add formatting, linting, and Vitest configuration without changing feature code.
- **Done when:** one command formats or checks the repo and Vitest can run package tests independently.

### OYA-003 Environment configuration

- **Files:** `packages/config`, `.env.example`
- **Depends on:** OYA-001
- **Work:** Validate database, API, worker, Base Sepolia, demo token, rate, and extended-public-key settings.
- **Done when:** missing or malformed required values fail with readable errors and `.env.example` contains no secrets.

### OYA-004 Local development guide

- **Files:** `README.md` or `docs/local-development.md`
- **Depends on:** OYA-001, OYA-003
- **Work:** Document database setup and how to run web, API, and worker separately.
- **Done when:** a new contributor can start the stack using only the guide.

## B. Shared contracts and payment rules

### OYA-010 Payment enums and DTOs

- **Files:** `packages/contracts`
- **Depends on:** none
- **Work:** Define payment statuses, error codes, receipt data, payment detail, merchant list, and SSE event types.
- **Done when:** API, worker, and web can import the same types without local duplicates.

### OYA-011 Request and response validation

- **Files:** `packages/contracts`
- **Depends on:** OYA-010
- **Work:** Add Zod schemas for payment creation, filters, payment detail, receipt, and realtime events.
- **Done when:** valid fixtures parse and invalid amounts, tokens, networks, and IDs are rejected with field-level errors.

### OYA-012 Payment state machine

- **Files:** `packages/domain`
- **Depends on:** OYA-010
- **Work:** Implement `CREATED → AWAITING_PAYMENT → CONFIRMING → PAID → PAYOUT_PENDING → SETTLED` and all supported side branches.
- **Done when:** valid transitions succeed, invalid transitions fail, and every transition includes a reason suitable for audit logging.

### OYA-013 Money and token arithmetic

- **Files:** `packages/domain`
- **Depends on:** none
- **Work:** Implement integer/base-unit helpers, fixed-precision rates, conversion, rounding, and comparison helpers.
- **Done when:** no helper uses floating-point money arithmetic and edge values have unit tests.

### OYA-014 Rate lock and expiry rules

- **Files:** `packages/domain`
- **Depends on:** OYA-013
- **Work:** Implement the 60-second rate lock, expiry check, five-minute top-up grace period, and late-payment tolerance decisions.
- **Done when:** tests cover before expiry, after expiry within grace, and after grace.

### OYA-015 Domain test suite

- **Files:** `packages/domain` tests
- **Depends on:** OYA-012, OYA-013, OYA-014
- **Work:** Add tests for underpayment, top-up, overpayment, wrong network, duplicate transaction, expiry, and payout failure.
- **Done when:** every documented transition and edge case has a passing test.

## C. Database and persistence

### OYA-020 Database schema

- **Files:** `packages/database` schema
- **Depends on:** OYA-010
- **Work:** Define merchants, payments, chain transactions, ledger entries, payouts, receipts, and audit events.
- **Done when:** all fields in `system-design.md` are represented with correct types and timestamps.

### OYA-021 Database constraints and indexes

- **Files:** `packages/database` schema and migrations
- **Depends on:** OYA-020
- **Work:** Add foreign keys, payment lookup indexes, unique transaction hash, and one-payout/one-receipt constraints.
- **Done when:** duplicate transaction and duplicate payout writes are rejected at the database layer.

### OYA-022 Initial migration

- **Files:** database migrations
- **Depends on:** OYA-021, OYA-003
- **Work:** Generate and run the initial migration against a development database.
- **Done when:** a fresh database can be created from migrations and the schema matches the package definitions.

### OYA-023 Persistence repositories

- **Files:** `packages/database` repositories
- **Depends on:** OYA-022, OYA-012
- **Work:** Add repositories for payment creation, payment lookup, status changes, chain transactions, ledger entries, payouts, receipts, and audit events.
- **Done when:** repository methods are transaction-safe and do not contain duplicated state-machine rules.

### OYA-024 Persistence tests

- **Files:** `packages/database` tests
- **Depends on:** OYA-023
- **Work:** Test idempotent writes, ownership filters, unique transaction hashes, atomic ledger writes, and rollback behavior.
- **Done when:** tests prove retrying a worker operation cannot double-credit a payment.

## D. Chain and address integration

### OYA-030 Base Sepolia adapter setup

- **Files:** `packages/chain`, `packages/config`
- **Depends on:** OYA-003
- **Work:** Configure viem client, chain ID, RPC URL, demo token address, and token decimals.
- **Done when:** the adapter can read the latest block from the configured network.

### OYA-031 Chain adapter interface

- **Files:** `packages/chain`
- **Depends on:** OYA-030
- **Work:** Implement `getLatestBlock`, `getTransfersInRange`, and `getConfirmations` behind the chain-neutral interface.
- **Done when:** the worker can use the adapter without importing viem-specific types.

### OYA-032 ERC-20 transfer parsing

- **Files:** `packages/chain`
- **Depends on:** OYA-031
- **Work:** Parse token transfer logs into normalized transfers with hash, sender, recipient, amount, block number, token, and network.
- **Done when:** valid logs parse and unrelated logs are ignored.

### OYA-033 Deposit address derivation

- **Files:** `packages/chain`
- **Depends on:** OYA-030
- **Work:** Derive a unique payment address from the server-side extended public key without private-key custody.
- **Done when:** the same payment index is deterministic, different indexes differ, and private key material is never required.

### OYA-034 Chain adapter tests

- **Files:** `packages/chain` tests
- **Depends on:** OYA-031, OYA-032, OYA-033
- **Work:** Mock RPC reads, confirmation counts, malformed logs, and address derivation.
- **Done when:** chain parsing and recovery behavior are covered without a live RPC call.

## E. Merchant and customer API

### OYA-040 Merchant authentication

- **Files:** `apps/api/src` auth module
- **Depends on:** OYA-020
- **Work:** Implement merchant sign-up/login/session handling suitable for the MVP.
- **Done when:** protected merchant endpoints reject unauthenticated requests and merchant ownership is enforced.

### OYA-041 Create payment endpoint

- **Files:** `apps/api/src` payment module
- **Depends on:** OYA-011, OYA-014, OYA-023, OYA-033
- **Work:** Accept naira amount and description, lock the rate, derive a deposit address, and persist the payment.
- **Done when:** valid input returns payment ID, locked token amount, expiry, network, and deposit address.

### OYA-042 Payment link and QR payload

- **Files:** `apps/api/src` payment module, shared contracts if needed
- **Depends on:** OYA-041
- **Work:** Generate a shareable payment URL and QR payload containing network, token, address, and exact amount.
- **Done when:** a customer can reconstruct the payment details from the returned payload.

### OYA-043 Payment detail endpoint

- **Files:** `apps/api/src` payment module
- **Depends on:** OYA-023, OYA-041
- **Work:** Return customer-safe payment details and merchant-authorized detail data.
- **Done when:** missing, expired, and unauthorized payments return consistent errors.

### OYA-044 Merchant payment list

- **Files:** `apps/api/src` dashboard module
- **Depends on:** OYA-040, OYA-023
- **Work:** Add status/date filters and today/this-week totals.
- **Done when:** results are scoped to the logged-in merchant and totals match filtered payment data.

### OYA-045 Receipt endpoint

- **Files:** `apps/api/src` receipt module
- **Depends on:** OYA-023
- **Work:** Return receipt data containing merchant, NGN amount, token amount, rate, transaction hash, and timestamp.
- **Done when:** only the customer payment view or owning merchant can retrieve the receipt.

### OYA-046 SSE payment events

- **Files:** `apps/api/src` realtime module
- **Depends on:** OYA-010, OYA-023
- **Work:** Stream payment status changes to the payment page and merchant dashboard.
- **Done when:** a status event is delivered without refresh and connections close cleanly.

### OYA-047 API validation and error tests

- **Files:** `apps/api/src` tests
- **Depends on:** OYA-041 through OYA-046
- **Work:** Test validation, auth, ownership, not-found, expired, and internal error responses.
- **Done when:** error responses use the shared contract and no controller duplicates domain logic.

### OYA-048 API route mounting and module registration

- **Files:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, API route/controller registration
- **Depends on:** OYA-040 through OYA-046
- **Work:** Mount auth, payment, merchant, receipt, and realtime controllers under the route table above.
- **Done when:** every route is reachable at the documented method and path, route prefixes are consistent, and an automated smoke test checks each mounted route.

### OYA-049 API output fixtures

- **Files:** `apps/api/src` fixtures and tests, `packages/contracts` fixtures if shared
- **Depends on:** OYA-047, OYA-048
- **Work:** Create representative success fixtures for payment creation, payment detail, merchant list, receipt, SSE events, and each documented error shape.
- **Done when:** web owners can build against stable examples without reading database internals.

## F. Chain watcher and settlement worker

### OYA-050 Block scanning job

- **Files:** `apps/worker/src` scanner job
- **Depends on:** OYA-031, OYA-023
- **Work:** Scan from the stored cursor to the latest block and persist progress.
- **Done when:** the job can resume after interruption without skipping a block.

### OYA-051 Transfer matching

- **Files:** `apps/worker/src` transfer processor
- **Depends on:** OYA-032, OYA-050
- **Work:** Match normalized transfers to payment deposit addresses and reject unsupported token/network deposits.
- **Done when:** matching is deterministic and wrong-network deposits are flagged rather than credited.

### OYA-052 Confirmation processing

- **Files:** `apps/worker/src` confirmation processor
- **Depends on:** OYA-012, OYA-023, OYA-051
- **Work:** Track confirmations and transition payments after the required two confirmations.
- **Done when:** processing the same block or transaction twice does not change the ledger twice.

### OYA-053 Underpayment and top-up

- **Files:** `apps/worker/src` payment processor
- **Depends on:** OYA-014, OYA-052
- **Work:** Mark underpaid payments, calculate the remaining amount, and allow valid top-up transfers.
- **Done when:** the payment can move from underpaid back to confirming and then paid.

### OYA-054 Overpayment and late payment

- **Files:** `apps/worker/src` payment processor
- **Depends on:** OYA-014, OYA-052
- **Work:** Record excess value and handle payments received after the rate lock according to tolerance rules.
- **Done when:** excess is visible in the ledger and late payments are repriced or flagged consistently.

### OYA-055 Expiry sweeper

- **Files:** `apps/worker/src` expiry job
- **Depends on:** OYA-014, OYA-023
- **Work:** Find unpaid expired payments and transition them safely.
- **Done when:** the sweeper is idempotent and never expires a confirmed payment.

### OYA-056 Mock payout and ledger settlement

- **Files:** `apps/worker/src` payout processor
- **Depends on:** OYA-012, OYA-023
- **Work:** Implement the payout provider interface, atomic ledger entries, receipt creation, and mocked settlement.
- **Done when:** a paid payment reaches `SETTLED` exactly once with one payout and one receipt.

### OYA-057 Worker recovery tests

- **Files:** `apps/worker/src` tests
- **Depends on:** OYA-050 through OYA-056
- **Work:** Test restart/backfill, duplicate hashes, retry behavior, and partial failures.
- **Done when:** a failed job can be retried without double credit or losing the cursor.

## G. Merchant and customer web flows

### OYA-060 Web API client

- **Files:** `apps/web/src/lib` or `apps/web/src/features/api`
- **Depends on:** OYA-010, OYA-041 through OYA-046
- **Work:** Add typed client functions for auth, payment creation, payment detail, dashboard, receipts, and SSE.
- **Done when:** pages consume typed functions rather than constructing request payloads inline.

### OYA-059 Web route smoke tests

- **Files:** `apps/web` route tests
- **Depends on:** OYA-005
- **Work:** Verify the landing, login, new payment, customer payment, dashboard, and payment detail routes mount and render their initial state.
- **Done when:** every route has a test for its URL and unauthenticated protected routes show the intended auth boundary.

### OYA-061 Merchant login page

- **Files:** `apps/web/src/pages`, auth feature files
- **Depends on:** OYA-040, OYA-060
- **Work:** Build login form, loading state, validation errors, and successful redirect.
- **Done when:** unauthenticated users can log in and invalid credentials are clearly handled.

### OYA-068 Web output and navigation contract

- **Files:** `apps/web/src/routes`, navigation components, page tests
- **Depends on:** OYA-059, OYA-061 through OYA-065
- **Work:** Connect CTA links, successful login redirects, payment creation redirects, customer payment links, dashboard links, and receipt actions to the documented routes.
- **Done when:** a user can move through the core journey using rendered links and buttons without manually editing the URL.

### OYA-062 Payment creation page

- **Files:** `apps/web/src/pages`, payment creation feature files
- **Depends on:** OYA-041, OYA-060
- **Work:** Build amount/description form and payment creation success state.
- **Done when:** a merchant can create a payment in under ten seconds and reach its QR screen.

### OYA-063 Customer payment page

- **Files:** `apps/web/src/pages`, customer payment feature files
- **Depends on:** OYA-042, OYA-043, OYA-046
- **Work:** Show merchant, naira amount, exact token amount, QR, countdown, address, and live status.
- **Done when:** awaiting, confirming, paid, expired, and wrong-network states are represented without refresh.

### OYA-064 Merchant dashboard

- **Files:** `apps/web/src/pages`, dashboard feature files
- **Depends on:** OYA-044, OYA-046, OYA-060
- **Work:** Build payment table/list, status filters, today/weekly totals, and realtime updates.
- **Done when:** the dashboard updates when a payment changes state and handles empty data.

### OYA-065 Receipt view

- **Files:** `apps/web/src/pages`, receipt feature files
- **Depends on:** OYA-045, OYA-060
- **Work:** Build receipt detail and download action.
- **Done when:** receipt displays rate, token, NGN amount, transaction hash, timestamp, and settlement status.

### OYA-066 Edge-case UI states

- **Files:** `apps/web/src/features` for payment and dashboard flows
- **Depends on:** OYA-063, OYA-064
- **Work:** Add underpayment top-up instructions, overpayment notice, expiry, wrong-network warning, loading, error, and empty states.
- **Done when:** every worker/API edge state has a clear user action or explanation.

### OYA-067 Responsive and accessibility pass

- **Files:** `apps/web/src/pages`, feature styles
- **Depends on:** OYA-061 through OYA-066
- **Work:** Verify mobile QR scanning layout, keyboard navigation, focus states, readable contrast, and reduced motion.
- **Done when:** core flows work at mobile and desktop widths without clipping or inaccessible controls.

## H. Shared UI and landing page

### OYA-070 Shared visual primitives

- **Files:** `apps/web/src/components`, `apps/web/src/styles`
- **Depends on:** OYA-060
- **Work:** Extract only reused buttons, status labels, cards, layout wrappers, and icons.
- **Done when:** repeated visual behavior has one source of truth and no page-specific duplicate primitive exists.

### OYA-071 Landing page product copy

- **Files:** `apps/web/src/pages/LandingPage.tsx`, `apps/web/src/components`
- **Depends on:** none
- **Work:** Keep copy focused on naira-priced requests, stablecoin payment, verified matching, receipts, and mocked payout limits.
- **Done when:** the page makes no unsupported claims and avoids unexplained crypto jargon.

### OYA-072 Landing page theme and typography

- **Files:** `apps/web/src/styles/tokens.css`, `apps/web/src/styles/landing.css`, `apps/web/index.html`
- **Depends on:** OYA-070
- **Work:** Maintain dark mode as default, verify the light variant, and keep Bricolage Grotesque headings with General Sans body text.
- **Done when:** both themes meet contrast requirements and no light-only surfaces leak into dark mode.

### OYA-073 Landing page visual QA

- **Files:** landing page only
- **Depends on:** OYA-071, OYA-072
- **Work:** Check nav, payment preview, compare section, lifecycle, dashboard mockup, FAQ, footer, mobile layout, and reduced motion.
- **Done when:** no overlap, unreadable badge, broken anchor, or overflow issue remains at desktop and mobile widths.

## I. Verification and demo readiness

### OYA-080 Happy-path demo

- **Files:** `docs/`, demo scripts if needed
- **Depends on:** OYA-057, OYA-063, OYA-064, OYA-065
- **Work:** Create a ₦8,500 payment, send testnet stablecoin, observe confirmation, and show receipt.
- **Done when:** the full path works live without manual database changes.

### OYA-081 Edge-case demo

- **Files:** `docs/`, demo scripts if needed
- **Depends on:** OYA-053, OYA-054, OYA-055
- **Work:** Demonstrate underpayment plus top-up and one expiry or overpayment case.
- **Done when:** the behavior is visible in both the customer and merchant experiences.

### OYA-082 End-to-end test

- **Files:** test package or `apps/*` integration tests
- **Depends on:** OYA-080
- **Work:** Test payment creation through worker confirmation, ledger write, receipt, and settlement.
- **Done when:** the test proves the happy path and fails if duplicate credit is introduced.

### OYA-083 Production limitations and demo notes

- **Files:** `README.md` or `docs/demo.md`, `docs/limitations.md`
- **Depends on:** OYA-080, OYA-081
- **Work:** Document testnet status, mocked naira payout, rate source, custody model, regulation assumptions, and recovery behavior.
- **Done when:** the team can explain clearly what is real in the MVP and what is intentionally mocked.

## Task handoff checklist

Before marking a task complete, include this in the PR description:

- Task ID and owner
- Files changed
- Routes or shared contracts added or changed
- Expected success output, with a sample payload or screenshot where useful
- Expected failure output, including status code or UI state
- Tests run
- Any follow-up task or boundary crossed

For route work, also record:

- HTTP method and path, or browser URL
- Authentication requirement
- Request parameters or body
- Success response or initial page state
- Loading, empty, unauthorized, not-found, and error behavior

## Deferred after MVP

- [ ] Real NGN off-ramp provider adapter.
- [ ] Live rate provider adapter.
- [ ] Additional networks and tokens.
- [ ] Email and WhatsApp notifications.
- [ ] Merchant exports and reconciliation reports.
- [ ] Production custody and key-management review.
- [ ] KYC, AML, and licensed-partner workflows.
