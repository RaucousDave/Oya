# Oya web development

The frontend is a React + Vite app. Its authentication backend runs in the NestJS app at `apps/api`. Better Auth's email/password handler is already registered in the API; the frontend does not host the authentication server.

For the proposed payment and merchant API contracts, see [the API README](../api/README.md). Those proposed routes should not be assumed to be implemented.

## Start the API development server

Run the following from the repository root (`oya`), not from `apps/web`.

### 1. Install dependencies

Use the repository's declared pnpm version, `11.9.0`, and a compatible Node.js installation:

```powershell
pnpm install
```

### 2. Configure the API environment

The database client currently uses the Neon serverless driver. Supply a reachable development Neon PostgreSQL database and keep credentials out of frontend variables and Git.

Set these variables in the same PowerShell terminal that will run the API:

```powershell
$env:NEON_DATABASE_URL = "postgresql://USER:PASSWORD@YOUR_NEON_HOST/DB_NAME?sslmode=require"
$env:NEON_DATABSE_URL = $env:NEON_DATABASE_URL
$env:BETTER_AUTH_URL = "http://localhost:3000"
$env:BETTER_AUTH_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
$env:PORT = "3000"
```

Replace the database placeholder with your development connection string. Generate the secret once for a development environment and retain it securely if you want sessions to survive restarts; generating a new secret can invalidate existing sessions.

**Both database variable names are currently necessary:** `packages/database/drizzle.config.ts` reads `NEON_DATABASE_URL`, while `packages/database/src/db.ts` reads `NEON_DATABSE_URL` (the spelling in the current code). `DATABASE_URL` from the root `.env.example` does not satisfy either reader.

Shell variables are inherited by the pnpm scripts and avoid ambiguity about `.env` locations. If using dotenv files instead, remember that the API script runs in `apps/api` and database scripts run in `packages/database`; the database package's `.env` is not automatically the API's `.env`.

### 3. Apply the existing database migrations

If your development database does not already have the current tables, run:

```powershell
pnpm --filter @oya/database db:migrate
```

This applies existing migrations to the configured database. Authentication needs the Better Auth tables as well as a working connection. Do not substitute a production database for your development database.

### 4. Run the API in watch mode

```powershell
pnpm dev:api
```

The root script runs `pnpm --filter @oya/api start:dev`, which executes `tsx watch src/main.ts`. The default API origin is **http://localhost:3000**. `PORT` overrides the port; update `BETTER_AUTH_URL` to match if you change it.

Leave this terminal running. Stop it with `Ctrl+C`.

From inside `apps/web`, the equivalent command is:

```powershell
pnpm --filter @oya/api start:dev
```

## Registered authentication routes

The current registration is:

- `apps/api/src/lib/auth.ts`: enables Better Auth email/password authentication and connects its Drizzle adapter to the shared database.
- `apps/api/src/app.module.ts`: imports `AuthModule.forRoot({ auth })` from `@thallesp/nestjs-better-auth`.
- `apps/api/src/main.ts`: starts NestJS with `bodyParser: false` so the integration can handle authentication requests.

Better Auth owns the `/api/auth/*` handler. These are the primary endpoints for the web app; response descriptions are summaries of the library's native responses, not custom Oya DTOs.

| Method and URL | Request | Session required? | Response |
|---|---|---|---|
| `POST /api/auth/sign-up/email` | JSON `{ name, email, password }`; optional `image`, `callbackURL` | No | User/token result and a session cookie when auto-sign-in is enabled. Does not create an Oya merchant business profile. |
| `POST /api/auth/sign-in/email` | JSON `{ email, password }`; optional `rememberMe`, `callbackURL` | No | User/token and redirect information, with a session cookie. |
| `GET /api/auth/get-session` | No body; browser sends its cookie if present | No | `{ user, session }` for a valid session, otherwise `null`. |
| `POST /api/auth/sign-out` | No body; send the current session cookie | Uses the current session | Success acknowledgement and cleared session cookie. |

Successful requests normally return `200`. Authentication failures use Better Auth's error responses. Let its client handle the session cookie rather than implementing a separate token-storage scheme.

Email verification delivery, password-reset delivery, and social providers are not configured in the current `auth.ts`. The wildcard registration alone does not make those complete user flows available.

References: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password), [session management](https://better-auth.com/docs/concepts/session-management), and [NestJS integration](https://better-auth.com/docs/integrations/nestjs).

## Check that the auth handler responds

In a second PowerShell terminal:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/auth/get-session"
```

With no session cookie, the expected JSON response is `null` (PowerShell may display no output for it). This checks routing and anonymous session handling; it does not prove that signup can write to the database. A `404` at `/` is not an auth failure: no root API controller is currently registered.

To inspect the raw HTTP status and response instead:

```powershell
curl.exe -i http://localhost:3000/api/auth/get-session
```

## Start the web app

In a separate terminal, from the repository root:

```powershell
pnpm dev:web
```

Or, from `apps/web`:

```powershell
pnpm dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Starting Vite does not start the API or worker. The worker is not needed just to run authentication.

## Browser authentication integration still to configure

The API handler is registered, but the current source does not yet establish the complete browser connection:

- `apps/web/package.json` does not declare the Better Auth client dependency.
- `apps/web/vite.config.ts` does not configure an API proxy.
- `apps/api/src/main.ts` does not explicitly enable cross-origin CORS.
- `apps/api/src/lib/auth.ts` does not explicitly trust the separate Vite origin.

When wiring the login UI, choose a same-origin development proxy or configure direct cross-origin requests. For direct requests from Vite to port 3000, allow the exact web origin with credentials in NestJS, include it in Better Auth's `trustedOrigins`, and send cookies with requests. Keep origin and CSRF checks enabled. If Vite selects a different port, the allowed origin must match it.

The intended React client, after adding `better-auth` to `@oya/web`, is:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
});
```

Use `authClient.signUp.email`, `authClient.signIn.email`, `authClient.useSession`, and `authClient.signOut` from the UI. For manual `fetch` calls to the API, set `credentials: "include"`. Never expose `BETTER_AUTH_SECRET` or the database connection string through `VITE_*` variables.

See [Better Auth client setup](https://better-auth.com/docs/installation). The example above documents intended integration; this README does not install packages or change server configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| Missing database connection string at startup | Set `NEON_DATABSE_URL` in the API terminal; the runtime spelling currently differs from the migration variable. |
| Migration configuration cannot read the connection string | Set `NEON_DATABASE_URL` in the terminal running the database script. |
| Missing auth tables or database errors during signup | Confirm both variables point to the same development database and existing migrations have been applied. |
| Nest reports no HTTP driver selected | The current API manifest does not directly declare `@nestjs/platform-express`; the Express-based setup needs that package at a version compatible with NestJS 11 if it is not otherwise available. |
| Import, module-format, or Drizzle adapter errors | Resolve the reported API/package compatibility issue before testing from the browser. Handler registration alone does not establish successful startup. |
| CLI request works but browser login fails | Check CORS, the exact trusted web origin, cookie credentials, and the actual Vite port. |
| Port 3000 is occupied | Choose another `PORT` and update the auth URL and frontend API origin consistently. |

These instructions are based on the current source configuration. A successful startup and authenticated database round-trip have not been verified as part of this documentation change.
