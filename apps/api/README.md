# Oya API reference

## Mounted endpoints

The API uses Better Auth session cookies. The shared DTOs live in [@oya/contracts](../../packages/contracts/src/index.ts). The current endpoints below take precedence over the original design proposals later in this document.

| Method and path | Access | Request and response |
|---|---|---|
| `POST /auth/signup` | Public | `{ email, password, businessName }`; returns a merchant summary and sets the session cookie. |
| `POST /auth/login` | Public | `{ email, password }`; returns a merchant summary and sets the session cookie. |
| `GET /auth/session` | Session | Returns `{ id, businessName }`. |
| `POST /auth/logout` | Session | Clears the session cookie and returns 204. |
| `POST /payments` | Session | `{ amount, description? }`, where `amount` is a naira decimal string such as `"8500.00"`. Requires an `Idempotency-Key` header. Returns the original checkout on a matching replay and 409 for changed input. |
| `GET /payments/:paymentId` | Public checkout link | Returns a customer-safe checkout with exact token units, due times, Base Sepolia details, and wallet URI. |
| `GET /payments/:paymentId/events` | Public checkout link | Sends an initial `payment` SSE event and changes to the checkout snapshot. Fetches committed state from PostgreSQL every two seconds while connected. |
| `GET /payments/:paymentId/receipt` | Public checkout link | Returns the settled receipt snapshot. |
| `GET /merchant/payments` | Session | Accepts `status`, `from`, `to`, `limit`, and `cursor`. Returns payment items, a next cursor, and filtered requested totals for today and this week in Lagos time. |
| `GET /merchant/payments/:paymentId` | Owner | Returns checkout, transfers, status history, ledger, and payout. |
| `GET /merchant/payments/:paymentId/{transactions,audit,ledger}` | Owner | Accepts `limit` and `cursor`. Returns the requested records and next cursor. |
| `GET /merchant/payments/:paymentId/receipt` | Owner | Returns the settled receipt. |

The original Better Auth handler is also mounted at `/api/auth/*`. Oya JSON errors include `statusCode` and `message`. Merchant routes return 404 for a missing or foreign-owned payment. Customer checkout IDs serve as shareable links.

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `DEPOSIT_XPUB`, and `DEMO_TOKEN_ADDRESS` before starting the API. Run `pnpm --filter @oya/database db:migrate` against the configured development database. Use an explicitly disposable, migrated PostgreSQL database as `DATABASE_TEST_URL` when running `pnpm --filter @oya/api test`. The integration test creates test merchants and payments in that database.

## Original MVP proposals

This is the proposed MVP HTTP contract derived from [system-design.md](../../system-design.md). The design explicitly names only `GET /payments/:paymentId/events`; the other paths, DTOs, pagination, and HTTP codes below are implementation proposals. This document does not claim these application routes are implemented.

The current API source configures Better Auth email/password authentication through the NestJS integration. Authentication routes are library-owned; payment and merchant routes belong to Oya. All paths below are relative to the API origin. Application routes have no `/api` prefix; Better Auth uses `/api/auth`.

## Implemented payment persistence

The [payment repository](../../packages/database/repository/payment.repository.ts) now implements the database operations below and is exported from `@oya/database`. This is persistence infrastructure: the HTTP routes and response DTOs in the rest of this document remain proposed until their controllers/services are implemented. Full payment-creation idempotency, address allocation, worker scheduling, ledger/audit orchestration, and SSE delivery are not implemented by these methods.

### Construction and shared types

```ts
import { db, PaymentRepository } from "@oya/database";
import type {
  InsertPaymentInput,
  ListMerchantPaymentsInput,
  OwnedPaymentInput,
  PaymentCursor,
  PaymentPage,
  UpdatePaymentStateInput,
  CheckoutPaymentView,
} from "@oya/database";

const payments = new PaymentRepository(db);
```

`OwnedPaymentInput` is `{ paymentId: string; merchantId: string }`. Resolve the merchant ID from the authenticated session. `PaymentCursor` is `{ timestamp: Date; id: string }`. Paginated methods return `PaymentPage<T>`, meaning `{ items: T[]; nextCursor: PaymentCursor | null }`. Encode/decode the cursor at the API boundary; do not pass an unvalidated query string directly to the repository.

Limits default to 20 and must be integers from 1 through 100. Ordering is descending by timestamp and ID, so equal timestamps do not cause records to be skipped. The extra look-ahead row is never included in `items`. Payment dates filter creation time with inclusive `from` and exclusive `to`; invalid dates and non-increasing ranges are rejected.

### Implemented methods

| Method | Input | Result and intended caller |
|---|---|---|
| `insertPayment` | `InsertPaymentInput`, described below | Full payment row. API creation service; inserts `AWAITING_PAYMENT`, received amount `"0"`, and version `0`. |
| `findByIdempotencyKey` | `{ merchantId, idempotencyKey }` | Full row or `null`. Creation lookup only; not original-response replay or fingerprint validation. |
| `findIdempotencyKey` | Same input | Compatibility alias for `findByIdempotencyKey`. Prefer the latter in new code. |
| `getMerchantPayment` | `{ paymentId, merchantId }` | Full owned row or `NotFoundError`. The legacy `(paymentId, merchantId)` signature remains supported for existing repository callers. |
| `listMerchantPayments` | `{ merchantId, status?, from?: Date, to?: Date, limit?, cursor? }` | `PaymentPage<Payments>` for merchant dashboards. |
| `getCheckoutPayment` | `{ paymentId }` | Restricted `CheckoutPaymentView` or `NotFoundError`; for public checkout, polling, and initial SSE snapshots. |
| `findPaymentById` | `{ paymentId }` | Full row or `null`; internal workers only, with no merchant authorization. |
| `findByDepositAddress` | `{ chainId: number, tokenAddress: string, depositAddress: string }` | Full row or `null`; matches all three fields and compares addresses case-insensitively. |
| `listPaymentsDueForExpiry` | `{ now: Date, limit: number, afterId?: string }` | Candidate rows in ascending ID order; no mutation. Batch limit is 1-100. |
| `lockPayment` | `{ paymentId }` | Full row locked until transaction completion, or `NotFoundError`; requires `forTransaction(tx)`. |
| `updatePaymentState` | `UpdatePaymentStateInput`, described below | Updated full row with incremented version, or `ConcurrentUpdateError`; requires `forTransaction(tx)`. |
| `listTransactions` | `{ paymentId, merchantId, limit?, cursor? }` | Page of chain transaction rows ordered by `detectedAt` and ID, after ownership verification. Uses an input object, not the old positional/offset signature. |

`Payments` is the exported schema-inferred payment row type. Full rows contain internal fields and are not HTTP response DTOs.

### Creation inputs and idempotency boundary

```ts
type InsertPaymentInput = {
  id?: string;
  createdAt?: Date;
  merchantId: string;
  reference: string;
  idempotencyKey: string;
  ngnAmountKobo: bigint;
  requiredTokenAmount: string;
  tokenAddress: string;
  tokenDecimals: number;
  chainId: number;
  lockedRateNumeric: string;
  rateExpiresAt: Date;
  topUpExpiresAt: Date;
  depositAddress: string;
};
```

This is an internal, server-prepared input, not the `POST /payments` body. Validate the client's kobo amount, fetch the rate, calculate required units/deadlines, allocate an address, and derive the merchant ID in services. The concrete implementation keeps the schema's `lockedRateNumeric` name. It does not accept the database planning README's proposed `lockedRate` or `addressAllocationId` fields. Address allocation/assignment remains a separate workflow.

Insertion initializes status, received amount, version, and timestamps. Token/deposit addresses are stored in lowercase; lookup also handles preexisting mixed-case rows. Do not supply predictable IDs for public checkout links; normally let the database package generate a UUID.

Uniqueness errors propagate instead of being swallowed. A duplicate deposit address or merchant reference must not be mistaken for an idempotent replay. The creation service still needs a canonical request fingerprint and persisted original response: same key/body replays, changed body conflicts. A lookup followed by an insert alone does not make concurrent creation safe. Commit creation, replay storage, address assignment, and initial audit together when those capabilities are implemented.

### Mapping repository results to HTTP

`getCheckoutPayment` selects only:

- `id`, `reference`, and `merchant: { businessName }`.
- `ngnAmountKobo`, `requiredTokenAmount`, `receivedTokenAmount`, and `lockedRate`.
- `token: { address, decimals }`, `chainId`, and `depositAddress`.
- `status`, `rateExpiresAt`, `topUpExpiresAt`, `createdAt`, and `updatedAt`.
- `receiptAvailable`, which is true only when the payment is `SETTLED` and has a receipt row.

It excludes merchant/auth IDs, bank fields, idempotency keys, and internal payment versions. API code must still build the documented `CheckoutPayment` DTO: stringify bigint amounts, serialize dates, add the configured token symbol and required confirmations, compute remaining units using integer arithmetic, and generate the checkout URL and QR payload. Legacy `updatedAt` can be null; map it to `createdAt` when producing the required timestamp. Do not spread an internal payment row into a public response.

Map `NotFoundError` to the same `404` for missing and foreign-owned resources. Validate cursor/limit/date input before querying; repository `RangeError`/`TypeError` for those invalid inputs corresponds to `400`. `ConcurrentUpdateError` is normally handled inside worker/service retry logic by rereading and reevaluating state, not by blindly repeating a stale update or exposing database details to the browser.

### Worker transactions and expiry

```ts
type UpdatePaymentStateInput = {
  paymentId: string;
  expectedVersion: number;
  expectedStatus: PaymentStatus;
  nextStatus: PaymentStatus;
  receivedTokenAmount: string;
  updatedAt: Date;
};
```

The expected version must be a nonnegative safe integer. Received token amount must be a nonnegative integer string of at most 78 digits. The update succeeds only if both expected version and status match, then increments the version. `FAILED` and `REFUNDED` are now persisted enum values matching the domain; this does not add public refund functionality.

Use the static `PaymentRepository.forTransaction(tx)` factory inside an existing Drizzle transaction. Calling lock/update methods on `new PaymentRepository(db)` fails before SQL executes. For example, the following illustrates a detection transition; the service must also persist the detected transfer in the same transaction when integrating the worker:

```ts
import { auditEvents, db, PaymentRepository } from "@oya/database";
import { transitionPayment } from "@oya/domain";

async function markDetectedPaymentConfirming(paymentId: string) {
  return db.transaction(async (tx) => {
    const repository = PaymentRepository.forTransaction(tx);
    const current = await repository.lockPayment({ paymentId });
    const transition = transitionPayment(
      current.status,
      "CONFIRMING",
      "Valid transfer detected",
    );
    const updated = await repository.updatePaymentState({
      paymentId,
      expectedVersion: current.version,
      expectedStatus: current.status,
      nextStatus: transition.to,
      receivedTokenAmount: current.receivedTokenAmount,
      updatedAt: transition.timestamp,
    });
    await tx.insert(auditEvents).values({
      paymentId,
      oldStatus: transition.from,
      newStatus: transition.to,
      reason: transition.reason,
      createdAt: transition.timestamp,
    });
    return updated;
  });
}
```

Do not let the transaction-bound repository escape the callback. Confirmation/settlement services must write related ledger entries, audit events, and other financial records through that same `tx`. The repository persists a domain-approved decision; it does not duplicate the domain state machine. Perform RPC/provider calls outside long-running transactions and publish realtime changes only after commit.

Expiry selection currently returns `AWAITING_PAYMENT` rows strictly after rate expiry and `UNDERPAID` rows strictly after the top-up deadline. Equality remains within the window. `CONFIRMING` and terminal states are excluded. These are candidates: lock and recheck current state and detected transfers before expiring, so a scan/confirmation race cannot invalidate a valid payment. Advance batches with the last row's ID and restart from the beginning after each sweep. Candidate selection alone is not a decision that a payment may safely expire.

### Migration and verification

Apply [the payment repository migration](../../packages/database/drizzle/20261118065735_groovy_bromley/migration.sql) before deploying callers of these methods:

```sh
pnpm --filter @oya/database db:migrate
pnpm --filter @oya/database typecheck
```

The migration adds payment versions and the missing domain statuses, and makes payment creation/transfer detection timestamps non-null for pagination. Historical missing payment creation times are inferred as rate expiry minus 60 seconds. Missing detection times use confirmation time when available, otherwise migration time; that fallback is not an exact historical detection timestamp. No live application migration was applied as part of implementing the repository.

Migration configuration reads `NEON_DATABASE_URL`; the current runtime client still reads the misspelled `NEON_DATABSE_URL`. Configure them consistently until that existing client configuration is corrected.

Integration tests require an explicit `DATABASE_TEST_URL` pointing to a disposable PostgreSQL database, then:

```sh
pnpm --filter @oya/database test:integration
```

Tests create and remove only a randomly named schema. They apply the SQL migrations and exercise precision, uniqueness, merchant isolation, address matching, filtered cursor pagination, checkout privacy, receipt availability, expiry boundaries, transfer listing, transaction enforcement, concurrent updates, and rollback of related ledger/payment writes. These tests do not establish full HTTP or worker integration.

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

### Authentication JSON examples

These illustrate the native Better Auth responses for the current email/password setup. Session tokens below are placeholders. Optional callbacks are omitted, so sign-in does not redirect; plugins or configuration changes can alter library responses.

### `POST /api/auth/sign-up/email`

Request body:

```json
{
  "name": "Ada",
  "email": "ada@example.com",
  "password": "example-password-123"
}
```

Response: `200`.

```json
{
  "token": "example-session-token",
  "user": {
    "id": "usr_ada",
    "name": "Ada",
    "email": "ada@example.com",
    "emailVerified": false,
    "image": null,
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:00:00.000Z"
  }
}
```

### `POST /api/auth/sign-in/email`

Request body:

```json
{
  "email": "ada@example.com",
  "password": "example-password-123",
  "rememberMe": true
}
```

Response: `200`.

```json
{
  "redirect": false,
  "token": "example-session-token",
  "user": {
    "id": "usr_ada",
    "name": "Ada",
    "email": "ada@example.com",
    "emailVerified": false,
    "image": null,
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:00:00.000Z"
  }
}
```

### `GET /api/auth/get-session`

Request body: none. Send the session cookie when available.

Response: `200`.

```json
{
  "user": {
    "id": "usr_ada",
    "name": "Ada",
    "email": "ada@example.com",
    "emailVerified": false,
    "image": null,
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:00:00.000Z"
  },
  "session": {
    "id": "session_example",
    "userId": "usr_ada",
    "token": "example-session-token",
    "expiresAt": "2026-11-23T10:00:00.000Z",
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:00:00.000Z",
    "ipAddress": "192.0.2.1",
    "userAgent": "Example browser"
  }
}
```

Without a valid session, the `200` response body is JSON `null`.

### `POST /api/auth/sign-out`

Request body: none. Send the session cookie.

Response: `200`.

```json
{
  "success": true
}
```

### Optional authentication examples

These require the email delivery configuration described above; they are not promises that the current app sends email.

### `POST /api/auth/request-password-reset`

Request body:

```json
{
  "email": "ada@example.com",
  "redirectTo": "https://checkout.example.com/reset-password"
}
```

Response: `200`.

```json
{
  "status": true,
  "message": "If this email exists in our system, check your email for the reset link"
}
```

### `POST /api/auth/reset-password`

Request body:

```json
{
  "newPassword": "new-example-password-123",
  "token": "example-reset-token"
}
```

Response: `200`.

```json
{
  "status": true
}
```

### `POST /api/auth/send-verification-email`

Request body:

```json
{
  "email": "ada@example.com"
}
```

Response: `200`.

```json
{
  "status": true
}
```

### `GET /api/auth/verify-email`

Request body: none.

Query: `?token=example-verification-token` (no callback URL).

Response: `200`.

```json
{
  "status": true,
  "user": null
}
```

With `callbackURL`, successful verification redirects to that allowed URL instead of returning the JSON example above.

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

### `POST /merchants`

Request body:

```json
{
  "businessName": "Ada Stores",
  "payoutDestination": {
    "bankCode": "000",
    "accountNumber": "0123456789",
    "accountName": "Ada Stores"
  }
}
```

Response: `201`.

```json
{
  "id": "mer_ada",
  "userId": "usr_ada",
  "businessName": "Ada Stores",
  "payoutDestination": {
    "bankCode": "000",
    "accountNumber": "0123456789",
    "accountName": "Ada Stores"
  },
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```

### `GET /merchants/me`

Request body: none.

Response: `200`.

```json
{
  "id": "mer_ada",
  "userId": "usr_ada",
  "businessName": "Ada Stores",
  "payoutDestination": {
    "bankCode": "000",
    "accountNumber": "0123456789",
    "accountName": "Ada Stores"
  },
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```

### `PATCH /merchants/me`

Request body:

```json
{
  "businessName": "Ada Market"
}
```

Response: `200`.

```json
{
  "id": "mer_ada",
  "userId": "usr_ada",
  "businessName": "Ada Market",
  "payoutDestination": {
    "bankCode": "000",
    "accountNumber": "0123456789",
    "accountName": "Ada Stores"
  },
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:30.000Z"
}
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

### Example values

The following examples describe the proposed contract, not live API responses. They use NGN 15,000 (`1500000` kobo), a rate of NGN 1,500 per USD, and a configured USD-pegged test token with six decimals: 10 tokens = `10000000` base units. Addresses, hashes, IDs, bank details, domains, and tokens are illustrative; replace them with configured or server-issued values. Payout, receipt, and transaction examples show later lifecycle snapshots of the same payment.

### `POST /payments`

Headers: `Content-Type: application/json`, `Idempotency-Key: create-payment-example-001`, and the session cookie.

Request body:

```json
{
  "ngnAmountKobo": "1500000"
}
```

Response: `201`.

```json
{
  "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "requiredTokenAmount": "10000000",
  "receivedTokenAmount": "0",
  "remainingTokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "lockedRate": "1500.000000",
  "rateExpiresAt": "2026-11-16T10:01:00.000Z",
  "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
  "depositAddress": "0x2222222222222222222222222222222222222222",
  "status": "AWAITING_PAYMENT",
  "requiredConfirmations": 2,
  "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
  "receiptAvailable": false,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z",
  "merchantId": "mer_ada"
}
```

### `GET /merchants/me/payments`

Request body: none.

Example query: `?limit=20&status=AWAITING_PAYMENT&from=2026-11-16T00:00:00.000Z&to=2026-11-17T00:00:00.000Z`. For later pages, pass the returned opaque `nextCursor` as `cursor`.

Response: `200`.

```json
{
  "items": [
    {
      "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
      "merchant": {
        "businessName": "Ada Stores"
      },
      "ngnAmountKobo": "1500000",
      "requiredTokenAmount": "10000000",
      "receivedTokenAmount": "0",
      "remainingTokenAmount": "10000000",
      "token": {
        "address": "0x1111111111111111111111111111111111111111",
        "symbol": "TESTUSD",
        "decimals": 6
      },
      "chainId": 84532,
      "lockedRate": "1500.000000",
      "rateExpiresAt": "2026-11-16T10:01:00.000Z",
      "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
      "depositAddress": "0x2222222222222222222222222222222222222222",
      "status": "AWAITING_PAYMENT",
      "requiredConfirmations": 2,
      "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
      "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
      "receiptAvailable": false,
      "createdAt": "2026-11-16T10:00:00.000Z",
      "updatedAt": "2026-11-16T10:00:00.000Z",
      "merchantId": "mer_ada"
    }
  ],
  "nextCursor": null
}
```

### `GET /merchants/me/payments/:paymentId`

Request body: none. Path: `paymentId=pay_8a6f0c4e92b741d5b307ef19a26c8d04`.

Response: `200`.

```json
{
  "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "requiredTokenAmount": "10000000",
  "receivedTokenAmount": "0",
  "remainingTokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "lockedRate": "1500.000000",
  "rateExpiresAt": "2026-11-16T10:01:00.000Z",
  "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
  "depositAddress": "0x2222222222222222222222222222222222222222",
  "status": "AWAITING_PAYMENT",
  "requiredConfirmations": 2,
  "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
  "receiptAvailable": false,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z",
  "merchantId": "mer_ada"
}
```

### `GET /merchants/me/payments/:paymentId/transactions`

Request body: none.

Query: `?limit=20`; optional `cursor` for subsequent pages.

Response: `200`.

```json
{
  "items": [
    {
      "id": "tx_example",
      "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
      "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "amount": "10000000",
      "blockNumber": "35000000",
      "confirmations": 2,
      "detectedAt": "2026-11-16T10:00:20.000Z",
      "confirmedAt": "2026-11-16T10:00:24.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /merchants/me/payments/:paymentId/payout`

Request body: none.

Response: `200`.

```json
{
  "id": "payout_example",
  "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "ngnAmountKobo": "1500000",
  "status": "SUCCEEDED",
  "provider": "mock",
  "providerReference": "mock_payout_example",
  "createdAt": "2026-11-16T10:00:25.000Z",
  "updatedAt": "2026-11-16T10:00:30.000Z"
}
```

### `GET /merchants/me/payments/:paymentId/receipt`

Request body: none.

Response: `200`.

```json
{
  "id": "rcpt_example",
  "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "tokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "rate": "1500.000000",
  "transactionHashes": [
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ],
  "createdAt": "2026-11-16T10:00:30.000Z"
}
```

### `GET /merchants/me/payments/:paymentId/audit-events`

Request body: none.

Query: `?limit=20`; optional `cursor`.

Response: `200`.

```json
{
  "items": [
    {
      "id": "audit_example",
      "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
      "oldStatus": "CREATED",
      "newStatus": "AWAITING_PAYMENT",
      "reason": "Payment address and rate prepared",
      "metadata": {},
      "createdAt": "2026-11-16T10:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### `GET /merchants/me/payments/:paymentId/ledger-entries`

Request body: none.

Query: `?limit=20`; optional `cursor`.

Response: `200`.

```json
{
  "items": [
    {
      "id": "ledger_example",
      "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
      "entryType": "TOKEN_RECEIVED",
      "amount": "10000000",
      "assetCode": "TESTUSD",
      "assetDecimals": 6,
      "chainId": 84532,
      "tokenAddress": "0x1111111111111111111111111111111111111111",
      "createdAt": "2026-11-16T10:00:24.000Z"
    }
  ],
  "nextCursor": null
}
```

All payment-specific merchant examples use the same `paymentId` path value shown above. An empty listing returns `{"items":[],"nextCursor":null}`. A non-null `nextCursor` means another page can be requested.

## Customer checkout and realtime

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `GET /payments/:paymentId` | Public checkout | Path: unguessable `paymentId` | `200`, `CheckoutPayment`. Also serves as polling fallback for SSE. |
| `GET /payments/:paymentId/events` | Public checkout; also usable by the merchant | Path: `paymentId`; `Accept: text/event-stream` | `200`, ongoing SSE stream of customer-safe payment snapshots. Unknown payment returns `404` before opening the stream. |
| `GET /payments/:paymentId/receipt` | Public checkout | Path: `paymentId` | `200`, `Receipt`; `404` until available. Excludes banking details and merchant login identity. |

The payment link is a bearer capability: do not use sequential or guessable IDs. Do not include payout destinations, auth-user IDs, ledger balances, or internal audit metadata in public responses. Do not provide a public payment-list endpoint. If ordinary internal IDs are retained, introduce a separate high-entropy checkout token and require it on all three public routes instead.

The browser renders `qrPayload` using `qrcode`; a separate QR-image endpoint is unnecessary. Customers send tokens through their wallets. They do not submit transaction hashes to mark payments paid. Underpayments are topped up at the same deposit address during the grace period, so no HTTP top-up mutation is required.

### `GET /payments/:paymentId`

Request body: none. Path: `paymentId=pay_8a6f0c4e92b741d5b307ef19a26c8d04`.

Response: `200`.

```json
{
  "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "requiredTokenAmount": "10000000",
  "receivedTokenAmount": "0",
  "remainingTokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "lockedRate": "1500.000000",
  "rateExpiresAt": "2026-11-16T10:01:00.000Z",
  "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
  "depositAddress": "0x2222222222222222222222222222222222222222",
  "status": "AWAITING_PAYMENT",
  "requiredConfirmations": 2,
  "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
  "receiptAvailable": false,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```

### `GET /payments/:paymentId/receipt`

Request body: none.

Response: `200`.

```json
{
  "id": "rcpt_example",
  "paymentId": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "tokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "rate": "1500.000000",
  "transactionHashes": [
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ],
  "createdAt": "2026-11-16T10:00:30.000Z"
}
```

### `GET /payments/:paymentId/events`

Request body: none. Use the same payment ID and send `Accept: text/event-stream`.

Response: `200`, `Content-Type: text/event-stream`. Each `data` value is a complete `CheckoutPayment`; the blank line terminates the event. This initial snapshot has no confirmed transfers yet.

```text
event: payment.updated
data: {"id":"pay_8a6f0c4e92b741d5b307ef19a26c8d04","merchant":{"businessName":"Ada Stores"},"ngnAmountKobo":"1500000","requiredTokenAmount":"10000000","receivedTokenAmount":"0","remainingTokenAmount":"10000000","token":{"address":"0x1111111111111111111111111111111111111111","symbol":"TESTUSD","decimals":6},"chainId":84532,"lockedRate":"1500.000000","rateExpiresAt":"2026-11-16T10:01:00.000Z","topUpExpiresAt":"2026-11-16T10:06:00.000Z","depositAddress":"0x2222222222222222222222222222222222222222","status":"AWAITING_PAYMENT","requiredConfirmations":2,"checkoutUrl":"https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04","qrPayload":"ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000","receiptAvailable":false,"createdAt":"2026-11-16T10:00:00.000Z","updatedAt":"2026-11-16T10:00:00.000Z"}

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

### Exact JSON structure: `CheckoutPayment`

Every field is shown below; none is optional in this proposed DTO. This is the public checkout response and the JSON inside each SSE `data` line. Example values illustrate the types; statuses and timestamps change through the lifecycle.

```json
{
  "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "requiredTokenAmount": "10000000",
  "receivedTokenAmount": "0",
  "remainingTokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "lockedRate": "1500.000000",
  "rateExpiresAt": "2026-11-16T10:01:00.000Z",
  "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
  "depositAddress": "0x2222222222222222222222222222222222222222",
  "status": "AWAITING_PAYMENT",
  "requiredConfirmations": 2,
  "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
  "receiptAvailable": false,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z"
}
```

### Exact JSON structure: `MerchantPayment`

The merchant DTO has all `CheckoutPayment` fields plus `merchantId` at the top level. It is not wrapped in a `payment` or `data` object. Creation and merchant detail endpoints return this object directly; the merchant list places these objects inside `items`.

```json
{
  "id": "pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "merchant": {
    "businessName": "Ada Stores"
  },
  "ngnAmountKobo": "1500000",
  "requiredTokenAmount": "10000000",
  "receivedTokenAmount": "0",
  "remainingTokenAmount": "10000000",
  "token": {
    "address": "0x1111111111111111111111111111111111111111",
    "symbol": "TESTUSD",
    "decimals": 6
  },
  "chainId": 84532,
  "lockedRate": "1500.000000",
  "rateExpiresAt": "2026-11-16T10:01:00.000Z",
  "topUpExpiresAt": "2026-11-16T10:06:00.000Z",
  "depositAddress": "0x2222222222222222222222222222222222222222",
  "status": "AWAITING_PAYMENT",
  "requiredConfirmations": 2,
  "checkoutUrl": "https://checkout.example.com/payments/pay_8a6f0c4e92b741d5b307ef19a26c8d04",
  "qrPayload": "ethereum:0x1111111111111111111111111111111111111111@84532/transfer?address=0x2222222222222222222222222222222222222222&uint256=10000000",
  "receiptAvailable": false,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z",
  "merchantId": "mer_ada"
}
```

## Optional dashboard and operational routes

These routes support the UI or deployment but are not explicitly required by the system design.

| Method and path | Access | Request | Successful response |
|---|---|---|---|
| `GET /merchants/me/dashboard` | Protected merchant | Query: `from?: ISO date-time`, `to?: ISO date-time`; same creation-time filter as payment listing | `200`, `{ paymentCount: number, countsByStatus: Record<PaymentStatus, number>, settledNgnAmountKobo: string }`. Sum each settled payment once; this is settled volume, not an available balance. |
| `GET /health/live` | Public | No body | `200`, `{ status: "ok" }` when the process can respond. |
| `GET /health/ready` | Public, minimal result | No body | `200`, `{ status: "ready" }` when the API's required database access is available; otherwise `503`, `{ status: "not_ready" }`. Does not claim worker or chain health. |

The payment creation response already contains the locked rate, so no standalone quote endpoint is required. A future rate-preview endpoint must clearly distinguish an indicative rate from a locked payment quote.

### `GET /merchants/me/dashboard`

Request body: none.

Example query: `?from=2026-11-16T00:00:00.000Z&to=2026-11-17T00:00:00.000Z`.

Response: `200`.

```json
{
  "paymentCount": 1,
  "countsByStatus": {
    "CREATED": 0,
    "AWAITING_PAYMENT": 0,
    "CONFIRMING": 0,
    "PAID": 0,
    "PAYOUT_PENDING": 0,
    "SETTLED": 1,
    "EXPIRED": 0,
    "UNDERPAID": 0,
    "OVERPAID": 0,
    "WRONG_NETWORK_FLAGGED": 0
  },
  "settledNgnAmountKobo": "1500000"
}
```

### `GET /health/live`

Request body: none.

Response: `200`.

```json
{
  "status": "ok"
}
```

### `GET /health/ready`

Request body: none.

Response: `200`.

```json
{
  "status": "ready"
}
```

When the database dependency is unavailable, readiness returns `503`:

```json
{
  "status": "not_ready"
}
```

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
