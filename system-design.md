# Oya System Design

## 1. Product summary

Oya is a stablecoin payment gateway for Nigerian merchants. A merchant creates a naira-priced payment request. Oya locks an NGN/USD rate for 60 seconds, derives a unique Base Sepolia deposit address, and displays a QR code. A customer pays with an ERC-20 test token. The worker detects and confirms the transfer, the API publishes live status updates, and a mocked payout produces a naira receipt.

The MVP does not custody customer private keys or make real naira payouts.

## 2. Architecture

Oya is a TypeScript monorepo with three applications and shared packages:

```text
Merchant/customer browser
        │ HTTP + Server-Sent Events
        ▼
React + Vite web app ─── NestJS API ─── PostgreSQL
                              ▲              ▲
                              │              │
                        NestJS worker ─── Drizzle ORM
                              │
                        Base Sepolia
```

The API handles short-lived HTTP requests. The worker handles long-running blockchain scans, confirmation updates, expiry sweeps, and mocked payouts. PostgreSQL is the source of truth for application state.

This is a modular monolith, not a microservice system. Modules have small interfaces and hide their implementation details. Blockchain-specific code is isolated behind a chain adapter.

## 3. Technology decisions

| Area | Technology | Purpose |
|---|---|---|
| Language | TypeScript | Shared types and implementation language |
| Frontend | React + Vite | Merchant dashboard and customer payment page |
| Frontend routing | React Router | Page and URL routing |
| Frontend data | TanStack Query | Server state, caching, and refetching |
| Styling | Tailwind CSS | UI styling |
| Backend | NestJS | HTTP API, SSE, authentication, orchestration |
| Worker | NestJS standalone app | Chain watcher and background processing |
| Database | PostgreSQL | Durable source of truth |
| ORM | Drizzle ORM + drizzle-kit | Schema, queries, and migrations |
| Blockchain | Base Sepolia | MVP test network |
| Blockchain library | viem | RPC access, ERC-20 event parsing, confirmations |
| Validation | Zod | Shared input and output validation |
| Testing | Vitest | Unit and integration tests |
| Package manager | pnpm workspaces | Monorepo management |
| Realtime | Server-Sent Events | Live payment status updates |
| QR codes | `qrcode` | Payment QR generation |
| Deployment | Vercel for web/API, Railway/Fly for worker | Initial hosting direction |

## 4. Repository structure

```text
oya/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── pages/             # Landing, auth, dashboard, and payment screens
│   │       ├── components/        # Reusable visual components
│   │       ├── features/          # Payments, dashboard, auth, receipts
│   │       ├── lib/               # Browser-only clients and helpers
│   │       └── main.tsx           # React entry point
│   ├── api/
│   │   └── src/
│   │       ├── modules/           # NestJS feature modules/controllers
│   │       ├── common/            # Guards, filters, and shared API helpers
│   │       ├── app.module.ts      # API module composition
│   │       └── main.ts            # HTTP server entry point
│   └── worker/
│       └── src/
│           ├── jobs/              # Scheduled work definitions
│           ├── processors/        # Idempotent work handlers
│           ├── worker.module.ts   # Worker dependency composition
│           └── main.ts            # Worker entry point
├── packages/
│   ├── contracts/                # Shared DTOs, enums, and Zod schemas
│   ├── domain/                   # Payment state machine and money rules
│   ├── database/                 # Drizzle schema, client, repositories
│   ├── chain/                    # ChainAdapter and Base Sepolia adapter
│   ├── config/                   # Environment parsing and configuration
│   └── test-utils/               # Fakes and fixtures for tests
├── drizzle/                      # Generated SQL migrations
├── docs/                         # Optional supporting technical notes
├── package.json                  # Workspace scripts
└── pnpm-workspace.yaml           # Workspace package declarations
```

### Public landing page

The landing page is part of `apps/web`, not a separate application or directory outside the monorepo. It is the public `/` route and shares the React application’s branding, Tailwind configuration, fonts, assets, and deployment setup.

```text
apps/web/src/pages/
├── LandingPage.tsx       # Public marketing page at /
├── LoginPage.tsx         # Merchant authentication
├── DashboardPage.tsx     # Merchant dashboard
└── PaymentPage.tsx       # Customer payment/status page
```

If the landing page later requires an independent deployment or technology stack, it can become `apps/landing`, but that is intentionally deferred for the MVP.

## 5. Payment lifecycle

```text
CREATED → AWAITING_PAYMENT → CONFIRMING → PAID → PAYOUT_PENDING → SETTLED
                     │             │         │
                     └→ EXPIRED    ├→ UNDERPAID
                                   ├→ OVERPAID
                                   └→ WRONG_NETWORK_FLAGGED
```

`UNDERPAID` supports top-ups:

```text
UNDERPAID → CONFIRMING → PAID
```

A payment can have multiple confirmed chain transactions. The required amount and all valid received amounts are summed in token base units. A unique transaction hash prevents duplicate credit.

Rules:

- Rate lock: 60 seconds.
- Top-up grace period: 5 minutes after rate expiry.
- Base Sepolia confirmation requirement: 2 confirmations for the MVP.
- NGN is stored in kobo.
- Token amounts are stored in smallest token units.
- Rates are fixed-precision decimal strings, never JavaScript floating-point numbers.
- All transitions are validated by one domain state-machine module.

## 6. Database model

### merchants

Merchant identity and payout destination.

### payments

One payment request, including merchant, NGN amount, required and received token amounts, token/network, locked rate, expiry timestamps, deposit address, and current status.

### chain_txs

Every detected blockchain transfer assigned to a payment. `tx_hash` is unique. Stores amount, block number, confirmations, and detection/confirmation timestamps.

### ledger_entries

Immutable financial events for received tokens, merchant balance, payout, and overpayment. Ledger writes happen in database transactions and are idempotent.

### payouts

One mocked payout operation per payment, with NGN amount, status, provider, and provider reference.

### receipts

One receipt snapshot per completed payment, including merchant, NGN amount, token amount, rate, transaction hashes, and timestamp.

### audit_events

Every status change with old status, new status, reason, metadata, and timestamp.

Relationships:

```text
Merchant 1 ─── many Payments
Payment  1 ─── many ChainTransactions
Payment  1 ─── many LedgerEntries
Payment  1 ─── one Payout
Payment  1 ─── one Receipt
Payment  1 ─── many AuditEvents
```

## 7. Module interfaces

```ts
interface ChainAdapter {
  getLatestBlock(): Promise<bigint>;
  getTransfersInRange(fromBlock: bigint, toBlock: bigint): Promise<ChainTransfer[]>;
  getConfirmations(blockNumber: bigint): Promise<number>;
}

interface RateProvider {
  getNgnUsdRate(): Promise<DecimalString>;
}

interface PayoutProvider {
  createPayout(input: PayoutInput): Promise<PayoutResult>;
}
```

The MVP uses a fixed-rate provider and mock payout provider. Production adapters can replace them without changing the payment state machine.

## 8. Security and correctness

- Oya never stores deposit private keys in the MVP path.
- The server uses an extended public key to derive unique deposit addresses.
- Merchant ownership is checked on every merchant payment query.
- Request payloads are validated at the API boundary.
- Database constraints enforce unique transaction hashes and one payout/receipt per payment.
- Worker handlers are idempotent and safe to retry.
- A stored block cursor allows the worker to resume and backfill after downtime.
- All money values avoid floating-point arithmetic.

## 9. Realtime flow

The customer or merchant opens:

```text
GET /payments/:paymentId/events
```

The worker writes a state change and an audit event. The API publishes an SSE event containing the updated payment status. The frontend updates without a full-page refresh. An in-memory event emitter is acceptable for the single-instance MVP; Redis or PostgreSQL notifications can support multiple API instances later.

## 10. Deliberate non-goals

- Real naira payout integration
- Custody of private keys
- Production KYC/AML workflows
- Multi-chain support in the first implementation
- Native mobile applications
- Microservices or event-bus infrastructure
