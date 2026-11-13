# Oya API reference

This is the proposed MVP HTTP contract derived from [system-design.md](../../system-design.md). The design explicitly names only `GET /payments/:paymentId/events`; the other paths, DTOs, pagination, and HTTP codes below are implementation proposals. This document does not claim these application routes are implemented.

The current API source configures Better Auth email/password authentication through the NestJS integration. Authentication routes are library-owned; payment and merchant routes belong to Oya. All paths below are relative to the API origin. Application routes have no `/api` prefix; Better Auth uses `/api/auth`.

## Request and response conventions

- JSON request bodies use `Content-Type: application/json`; ordinary responses use `application/json`.
- `?` in a field definition means optional. GET requests have no body. IDs are opaque strings.
- NGN amounts are integer kobo strings; token amounts are integer base-unit strings. Never serialize money through JavaScript floating-point numbers. Rates are decimal strings, expressed as NGN per USD. Dates are UTC ISO 8601 strings.
- `Protected` means a valid Better Auth session cookie is required. The API derives the user and merchant from that session, never from a client-supplied owner ID.
- Merchant-owned resource queries must filter by the authenticated merchant. Return `404` for missing or other merchants' resources, avoiding disclosure of their existence.
- `Public checkout` means no login, but possession of an unguessable payment link is required. It returns only the customer-safe projection below. This access model is a proposal because the design does not specify customer authentication.
- Cross-origin browser requests carrying cookies require credentialed requests, an explicit allowed web origin, and compatible cookie configuration. Keep Better Auth's origin/CSRF checks enabled.
- Paginated endpoints accept `limit?: integer` (default 20, range 1–100) and `cursor?: string`, and return `{ items: T[], nextCursor: string | null }`. Reject malformed cursors. Use a stable creation-time/ID ordering.
- Validate inputs with shared Zod contracts. Reject attempts to set computed fields such as status, locked rate, received amount, confirmations, or deposit address.

## Authentication routes

Mount the Better Auth handler at `/api/auth/*`; do not implement duplicate password or session controllers. The following are the routes Oya's MVP client needs. Better Auth may expose other built-in endpoints; this is not an exhaustive inventory of its internal API. Responses are native Better Auth JSON, not the Oya error envelope described below.

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `POST /api/auth/sign-up/email` | Public | `{ name: string, email: string, password: string, image?: string, callbackURL?: string }` | `200`, user and session-token result; sets session cookie when auto-sign-in is enabled. Creates the auth identity, not a merchant profile. |
| `POST /api/auth/sign-in/email` | Public | `{ email: string, password: string, rememberMe?: boolean, callbackURL?: string }` | `200`, user/token and redirect information; sets session cookie. |
| `GET /api/auth/get-session` | Public; reads cookie if present | No body | `200`, `{ user, session }`, or `null` when unauthenticated. |
| `POST /api/auth/sign-out` | Current session cookie; library-managed | No body | `200`, `{ success: true }`; clears the session cookie. |

Use the Better Auth client to consume these native responses. Passwords remain in Better Auth's credential records, never in `merchants`. The application resolves `session.user.id -> merchants.user_id -> payments.merchant_id`.

Password recovery and verification are optional follow-up capabilities, not configured in the current `auth.ts`. If enabled with email delivery callbacks, the relevant library routes are:

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `POST /api/auth/request-password-reset` | Public | `{ email: string, redirectTo?: string }` | `200`, generic status/message acknowledgement without confirming account existence. |
| `POST /api/auth/reset-password` | Public; valid reset token required | `{ newPassword: string, token: string }` | `200`, status acknowledgement; invalid/expired token produces a library error. |
| `POST /api/auth/send-verification-email` | Library-managed identity checks | `{ email: string, callbackURL?: string }` | `200`, status acknowledgement if accepted. |
| `GET /api/auth/verify-email` | Public; valid verification token required | Query: `token: string`, `callbackURL?: string` | Verification JSON result, or redirect when a callback URL is supplied. |

Sources: [email/password endpoints](https://better-auth.com/docs/authentication/email-password), [session management](https://better-auth.com/docs/concepts/session-management), [NestJS integration](https://better-auth.com/docs/integrations/nestjs). The NestJS integration guards application routes globally by default: explicitly mark checkout and health controllers anonymous. Better Auth itself handles its auth routes.

## Merchant onboarding and profile

Proposed MVP assumption: one merchant business per auth user. Payout destinations are used only by the mock provider.

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `POST /merchants` | Protected user; merchant not yet required | `{ businessName: string, payoutDestination?: { bankCode: string, accountNumber: string, accountName: string } }` | `201`, `Merchant`. The server assigns `userId`. `409` if the user already owns a profile. |
| `GET /merchants/me` | Protected | No body | `200`, `Merchant`; `404` if onboarding is incomplete. |
| `PATCH /merchants/me` | Protected merchant | `{ businessName?: string, payoutDestination?: { bankCode: string, accountNumber: string, accountName: string } }`; at least one field | `200`, updated `Merchant`. A supplied payout destination replaces the full destination. |

```ts
type Merchant = {
  id: string;
  userId: string;
  businessName: string;
  payoutDestination: {
    bankCode: string;
    accountNumber: string; // Text preserves leading zeros; owner-only response.
    accountName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};
```

## Payment creation and merchant views

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `POST /payments` | Protected merchant | `{ ngnAmountKobo: string }`, positive integer string. Proposed required header: `Idempotency-Key: string`. | `201`, `MerchantPayment`; includes checkout URL and QR payload. Same key and body replay the original response; changed body with the same key returns `409`. |
| `GET /merchants/me/payments` | Protected merchant | Pagination query plus `status?: PaymentStatus`, `from?: ISO date-time`, `to?: ISO date-time`; dates filter creation time, inclusive `from`, exclusive `to` | `200`, page of `MerchantPayment`. |
| `GET /merchants/me/payments/:paymentId` | Protected owning merchant | Path: `paymentId` | `200`, `MerchantPayment`. |
| `GET /merchants/me/payments/:paymentId/transactions` | Protected owning merchant | Path: `paymentId`; pagination query | `200`, page of `ChainTransaction`. |
| `GET /merchants/me/payments/:paymentId/payout` | Protected owning merchant | Path: `paymentId` | `200`, `Payout`; `404` until a payout record exists. |
| `GET /merchants/me/payments/:paymentId/receipt` | Protected owning merchant | Path: `paymentId` | `200`, `Receipt`; `404` until the completed payment has a receipt. |
| `GET /merchants/me/payments/:paymentId/audit-events` | Protected owning merchant | Path: `paymentId`; pagination query | `200`, page of `AuditEvent`. |
| `GET /merchants/me/payments/:paymentId/ledger-entries` | Protected owning merchant | Path: `paymentId`; pagination query | `200`, page of `LedgerEntry`. |

The MVP server selects its configured Base Sepolia test token and network. The request cannot supply an arbitrary token or network. Payment creation locks the rate for 60 seconds, derives a unique deposit address, calculates the required token amount, and sets the top-up deadline to five minutes after rate expiry. A successful response should represent a ready `AWAITING_PAYMENT` request. Idempotency keys are scoped to merchant and operation and must be persisted atomically with creation.

Transaction, audit, and ledger listing routes are proposed inspection conveniences; they can be deferred if the MVP dashboard does not expose those views. A table does not inherently require a CRUD controller.

## Customer checkout and realtime

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `GET /payments/:paymentId` | Public checkout | Path: unguessable `paymentId` | `200`, `CheckoutPayment`. Also serves as polling fallback for SSE. |
| `GET /payments/:paymentId/events` | Public checkout; also usable by the merchant | Path: `paymentId`; `Accept: text/event-stream` | `200`, ongoing SSE stream of customer-safe payment snapshots. Unknown payment returns `404` before opening the stream. |
| `GET /payments/:paymentId/receipt` | Public checkout | Path: `paymentId` | `200`, `Receipt`; `404` until available. Excludes banking details and merchant login identity. |

The payment link is a bearer capability: do not use sequential or guessable IDs. Do not include payout destinations, auth-user IDs, ledger balances, or internal audit metadata in public responses. Do not provide a public payment-list endpoint. If ordinary internal IDs are retained, introduce a separate high-entropy checkout token and require it on all three public routes instead.

The browser renders `qrPayload` using `qrcode`; a separate QR-image endpoint is unnecessary. Customers send tokens through their wallets. They do not submit transaction hashes to mark payments paid. Underpayments are topped up at the same deposit address during the grace period, so no HTTP top-up mutation is required.

Example SSE frame (`data` contains a complete `CheckoutPayment` in the actual contract):

```text
event: payment.updated
data: {"id":"opaque-payment-id","status":"CONFIRMING", "...":"remaining checkout fields"}

```

Send a complete current snapshot immediately on connection and after committed state changes. Heartbeat comments may keep the connection alive. On reconnect, send a fresh database snapshot; the MVP in-memory emitter does not guarantee replay and ignores `Last-Event-ID`. The client can refetch the GET endpoint after interruption. Handle errors after opening the stream as stream termination, not a new JSON HTTP response. Return `Cache-Control: no-cache` and disable proxy buffering where supported.

## Response DTOs

These are proposed shared contracts, not copies of existing implementation types. `IntegerString` and `DecimalString` require runtime validation. Payout statuses and ledger fields are proposed because the system design does not enumerate them.

```ts
type IntegerString = string;
type DecimalString = string;
type PaymentStatus =
  | "CREATED" | "AWAITING_PAYMENT" | "CONFIRMING" | "PAID"
  | "PAYOUT_PENDING" | "SETTLED" | "EXPIRED" | "UNDERPAID"
  | "OVERPAID" | "WRONG_NETWORK_FLAGGED";

type CheckoutPayment = {
  id: string;
  merchant: { businessName: string };
  ngnAmountKobo: IntegerString;
  requiredTokenAmount: IntegerString;
  receivedTokenAmount: IntegerString; // Sum of valid confirmed transfers only.
  remainingTokenAmount: IntegerString; // max(required - received, 0).
  token: { address: string; symbol: string; decimals: number };
  chainId: number;
  lockedRate: DecimalString;
  rateExpiresAt: string;
  topUpExpiresAt: string;
  depositAddress: string;
  status: PaymentStatus;
  requiredConfirmations: number; // 2 for the MVP; per-transfer progress is separate.
  checkoutUrl: string;
  qrPayload: string; // Wallet-compatible payment URI with configured chain/token/amount.
  receiptAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

type MerchantPayment = CheckoutPayment & { merchantId: string };

type ChainTransaction = {
  id: string;
  paymentId: string;
  txHash: string;
  amount: IntegerString;
  blockNumber: IntegerString;
  confirmations: number;
  detectedAt: string;
  confirmedAt: string | null;
};

type Payout = {
  id: string;
  paymentId: string;
  ngnAmountKobo: IntegerString;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  provider: "mock";
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
};

type Receipt = {
  id: string;
  paymentId: string;
  merchant: { businessName: string }; // Snapshot at completion.
  ngnAmountKobo: IntegerString;
  tokenAmount: IntegerString;
  token: { address: string; symbol: string; decimals: number };
  chainId: number;
  rate: DecimalString;
  transactionHashes: string[];
  createdAt: string;
};

type AuditEvent = {
  id: string;
  paymentId: string;
  oldStatus: PaymentStatus | null; // Null for initial creation.
  newStatus: PaymentStatus;
  reason: string;
  metadata: Record<string, unknown>; // Allowlisted merchant-safe values only.
  createdAt: string;
};

type LedgerEntry = {
  id: string;
  paymentId: string;
  entryType: "TOKEN_RECEIVED" | "MERCHANT_CREDIT" | "PAYOUT" | "OVERPAYMENT";
  amount: IntegerString; // Nonnegative magnitude; entryType identifies the event.
  assetCode: string;
  assetDecimals: number;
  chainId: number | null;
  tokenAddress: string | null;
  createdAt: string;
};
```

Ledger events are immutable and idempotent. Do not infer a balance by adding every `amount`: assets and event semantics differ, and overpayment may describe value already counted in a received transfer. Final accounting rules must define balance aggregation before exposing a balance endpoint.

## Optional dashboard and operational routes

These routes support the UI or deployment but are not explicitly required by the system design.

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `GET /merchants/me/dashboard` | Protected merchant | Query: `from?: ISO date-time`, `to?: ISO date-time`; same creation-time filter as payment listing | `200`, `{ paymentCount: number, countsByStatus: Record<PaymentStatus, number>, settledNgnAmountKobo: string }`. Sum each settled payment once; this is settled volume, not an available balance. |
| `GET /health/live` | Public | No body | `200`, `{ status: "ok" }` when the process can respond. |
| `GET /health/ready` | Public, minimal result | No body | `200`, `{ status: "ready" }` when the API's required database access is available; otherwise `503`, `{ status: "not_ready" }`. Does not claim worker or chain health. |

The payment creation response already contains the locked rate, so no standalone quote endpoint is required. A future rate-preview endpoint must clearly distinguish an indicative rate from a locked payment quote.

## Application errors

Proposed error shape for Oya JSON endpoints (Better Auth keeps its native shape):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ngnAmountKobo must be a positive integer string",
    "details": [{ "field": "ngnAmountKobo", "message": "Invalid amount" }]
  }
}
```

`details` is optional and must not expose secrets or internal exceptions.

| Status | Meaning |
|---|---|
| `400` | Invalid body, ID format, filter, cursor, or missing required idempotency key. |
| `401` | Missing or expired session on a protected endpoint. |
| `403` | Authenticated user lacks the merchant profile required for an operation. |
| `404` | Unknown resource, other merchant's resource, or payout/receipt not yet created. |
| `409` | Duplicate merchant onboarding or idempotency key reused with different input. |
| `429` | Request rate limit exceeded, if configured. |
| `500` | Unexpected server failure; return a generic message. |
| `503` | Required database, rate provider, or address-derivation dependency unavailable. |

## Worker-owned operations: no public mutation routes

The worker scans blockchain transfers, persists its block cursor, updates confirmations, expires requests, records financial events, runs mocked payouts, and creates receipts. These are internal processors sharing PostgreSQL, not browser-triggered HTTP actions.

Do not mount routes for manually marking a payment paid, modifying confirmations, inserting chain transactions, writing ledger entries, triggering payouts, forcing settlement, or creating receipts. State changes must pass through the domain state machine, with financial writes and audit events committed transactionally. Unique transaction hashes and one payout/receipt per payment enforce the design's retry guarantees.

The MVP also needs no real payout-provider webhook, refund endpoint, KYC endpoint, custody/private-key endpoint, or multi-chain management API. Overpayment resolution and wrong-network recovery behavior remain unspecified by the design; do not invent financial mutation routes for them.

## Suggested mounting order

1. Register Better Auth in `src/app.module.ts`, using the server instance in `src/lib/auth.ts` and the documented body-parser setup in `src/main.ts`.
2. Add protected merchant onboarding and payment creation/query controllers.
3. Add explicitly anonymous checkout, SSE, and receipt handlers with restricted response DTOs.
4. Add read-only payout, transaction, audit, ledger, and dashboard views as their screens require.
5. Add minimal liveness/readiness probes for deployment.

The `/`, `/login`, dashboard, and checkout page URLs are React routes in `apps/web`; they are not additional NestJS API endpoints.
