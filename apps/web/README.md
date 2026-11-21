# Oya web development

Oya uses React Router and TanStack Query for the merchant dashboard and public checkout. The browser connects to the NestJS API using an HttpOnly Better Auth session cookie for merchant requests.

1. Install workspace dependencies with `pnpm install`.
2. Set the server variables from [the example environment](../../.env.example). Use a development PostgreSQL database, generate a Better Auth secret, and set the address and decimals for your Base Sepolia test token. Set these in the shell or load them from the API working directory. Keep server secrets out of `VITE_*` variables.
3. Run `pnpm --filter @oya/database db:migrate` against the development database, then run `pnpm dev:api`.
4. Run `pnpm dev:web` in another terminal and open the Vite origin, usually `http://localhost:5173`. For custom ports, match `WEB_ORIGIN` to Vite and `VITE_API_URL` and `BETTER_AUTH_URL` to Nest.

Open `/login` to create a merchant account, then use `/payments/new` to generate a shareable checkout link. `/dashboard` lists merchant payments, and `/pay/:paymentId` is the public checkout. The landing page also has a local simulation. Live checkout updates reflect committed database writes. Automated chain scanning and payout execution require the worker implementation.

See the [mounted HTTP endpoints](../api/README.md) for request and response details.
