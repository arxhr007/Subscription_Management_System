# Brightloop

A subscription workspace built with Nuxt 4, Vue 3, Nuxt UI 4, Express, Prisma 6, Supabase Auth/PostgreSQL, and optional DeepSeek Flash. pnpm manages the workspace.

## Start locally

Use Node 22.12+ (or a supported newer Node release) and the pnpm version pinned in package.json.

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Fill the API environment values described below.
pnpm --filter @brightloop/api db:generate
pnpm setup
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:4000. The web server proxies `/api` and event streams so browser requests stay on one origin. All database and AI credentials remain server-side. Both services must remain running.

## New Supabase project

1. Create `brightloop` in your free Supabase organization, in a region close to the API host. Save the database password securely.
2. In Connect, copy the PostgreSQL **session pooler** connection (port 5432). It supports persistent Node processes and avoids IPv6-only direct-connection problems. Set `DATABASE_URL` and `DIRECT_URL`, adding `schema=brightloop&sslmode=require`. URL-encode special characters in the database password.
3. In API settings, copy the project URL, publishable key and secret key into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. A legacy anon/service-role key can be used in the corresponding variables if that is what your project provides. The secret key is server-only.
4. Keep `brightloop` out of Supabase's exposed API schemas. The migration revokes application schema/table access from `anon` and `authenticated`; all application data access goes through Express/Prisma authorization. Never expose the PostgreSQL credential to a browser.
5. Run `pnpm setup` to apply the reviewed PostgreSQL migration. This creates only the application schema; it does not modify Supabase's `auth` schema.
6. Optionally seed the **empty** application database before bootstrapping: `pnpm --filter @brightloop/api seed`. It refuses to seed a populated application database. The seed creates business fixtures, not working Supabase login credentials.
7. Set `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD`, and optionally `BOOTSTRAP_NAME` in `apps/api/.env`, then run `pnpm --filter @brightloop/api bootstrap`. Remove the bootstrap password afterward. The script refuses to create an additional linked administrator.
8. Sign in with that administrator and add staff in Team. New customers register through the app. Existing customer records are deliberately not claimed through unverified email signup.

No SMTP, outbox, magic-link flow, email verification workflow or email password reset is implemented. Customer signup uses the server admin API to create an immediately usable Supabase identity, while refusing any email already attached to application records. This is the user's requested no-email scope and intentionally departs from the PDF email-reset requirement. Administrators handle recovery in Supabase until a dedicated recovery workflow is implemented.

## Optional features

- `DEEPSEEK_API_KEY` enables Ask Finance. `DEEPSEEK_MODEL` defaults to `deepseek-flash`. The assistant can call only validated read-only tools, with bounded iterations and API timeouts; normal billing does not depend on AI.
- `RUN_SCHEDULER=true` enables the minute-based scheduler. Run this on a persistent API process. PostgreSQL advisory locks coordinate worker runs and invoice creation.
- `ENABLE_TIME_MACHINE=true` enables admin demo clock advances. Leave it off outside demo environments. Clock reset does not undo generated invoices/payments.
- Portal payments are explicitly **simulated**; no payment gateway charges occur.

## Verification

```sh
pnpm test                 # Shared business logic
pnpm typecheck            # Shared, API and Nuxt
pnpm build                # Production Nuxt app
pnpm test:integration     # Disposable real PostgreSQL migration/concurrency checks
pnpm exec playwright install chromium
pnpm test:browser         # Production build, desktop/mobile with API fixtures
```

`test:integration` starts a temporary PostgreSQL server through a development-only embedded package, applies migrations, checks duplicate invoices, discount limits, payment retries/concurrency and catch-up before closure, then removes its own temporary data. It does not connect to your hosted database. Browser fixtures test rendering and client workflows; they do not prove live Supabase authentication. Run live acceptance checks after provisioning and adding secrets.

Every payment POST requires a UUID `Idempotency-Key`. Reconciliation preview supplies a durable fingerprint per statement entry; identical date/reference/description/amount entries are treated as the same transaction. If a bank exports genuinely distinct identical entries, review them and record them separately with distinct payment keys rather than repeatedly importing the row.

## Deployment

Deploy `apps/web/.output/server/index.mjs` as a Node service after `pnpm build`; configure `NUXT_API_ORIGIN` to the private API service. Start the API with `pnpm --filter @brightloop/api start`. Set `NODE_ENV=production`, `WEB_ORIGIN` to the exact HTTPS public origin and provide server environment secrets. The browser receives HttpOnly, Secure, SameSite cookies. Reverse proxies must preserve multiple Set-Cookie headers and stream SSE without buffering. Expose only the web service publicly when possible.

Run Prisma `migrate deploy` before starting the new release. Keep backups and inspect future migrations; never force-reset the cloud database. Free Supabase quotas, project pausing and network latency mean availability and sub-two-second cold page loads are not guaranteed. Measure the hosted workload before claiming the PDF performance target.

## Structure

- `apps/web/app`: Nuxt layouts, pages, UI components and composables.
- `apps/web/server/api`: server-only upstream proxy.
- `apps/api`: Express routes, Supabase Auth integration, Prisma migrations, billing and seed.
- `packages/shared`: Zod contracts and pure billing/money/reconciliation logic.
- `tests/browser`: desktop/mobile UI checks using synthetic fixtures.
- `docs/legacy-react`: original partial frontend retained as migration reference, excluded from the app.
- `TODO.md`: checked implementation status and remaining cloud verification.

## External subscription tracker and Google sign-in

Customers can open **External subscriptions** in their portal to track subscriptions they buy. These records are isolated by the application user and never feed Brightloop invoicing. Monthly/yearly estimates include active entries only. Renewal dates within seven days and past dates produce an in-app reminder; dates do not advance automatically because provider status is unknown. Marking an entry cancelled changes the local tracker only.

Gmail is the discovery source for personal subscriptions. Manual entry remains available. Bank CSV import remains part of business payment reconciliation.

For Google OAuth:

1. Create a Google Cloud OAuth **Web application** client and consent screen. During testing, add your Google account as a test user.
2. Set the Google authorized redirect URI to `https://tndiaxomaorbyvttfpgr.supabase.co/auth/v1/callback`.
3. In Supabase → Authentication → Sign In / Providers → Google, enable Google and save the client ID and secret. Do not put the secret in Nuxt public configuration.
4. In Supabase Auth URL configuration, allow `http://localhost:3000/api/auth/callback` (and your exact deployed HTTPS callback). Set the site URL to your app origin. Keep `WEB_ORIGIN` aligned with that origin.
5. Reload the login page; **Continue with Google** appears when Supabase reports the provider is enabled. The server stores a ten-minute HttpOnly PKCE verifier cookie, exchanges the callback code, then sets the app session cookies.

New Google identities receive CUSTOMER profiles only. Existing profiles are matched by verified Supabase identity ID, never automatically claimed by matching an email. If a matching email belongs to a different application identity, use the existing login and contact an administrator. Google login grants identity scopes only; it does not import Gmail, Play, Netflix or Amazon subscriptions.

With authorized Supabase CLI access, you can also save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env`, run `node scripts/configure-google.mjs` to review the provider diff, then `node scripts/configure-google.mjs --apply` to enable it. The committed TOML contains environment references, not the secret. The Google Cloud redirect URI still needs to be configured in Google Cloud Console.

## Finance operations overview

The staff overview now prioritizes due billing, invoice review, overdue collections and bank reconciliation. A lifecycle view links directly to filtered subscription queues; renewal radar groups contracts into expired, next-seven-days and upcoming decisions. Admins can rehearse a billing month with explicit demo-data impact and readable run results. Reporting distinguishes recurring revenue from collected cash and supports plan/period filters. Nuxt UI default theme tokens are used throughout the shell.

The dashboard shell and theme follow the official [Nuxt UI dashboard template](https://github.com/nuxt-ui-templates/dashboard): Public Sans, green/zinc tokens, workspace/user dropdowns, command search, dashboard toolbar and joined stat cards. Adapted template portions retain the upstream MIT notice in docs/licenses/nuxt-dashboard-MIT.txt. Financial metrics and operational actions remain connected to Brightloop data.

## Gmail receipt discovery

Customer portal → External subscriptions → **Connect Gmail**. This requests separate `gmail.readonly` consent through Supabase Google OAuth. Use the same Google identity as the Brightloop account. The callback binds the grant to the initiating customer and stores provider access/refresh tokens encrypted with AES-256-GCM using the server-only `GMAIL_TOKEN_KEY` (64 hex characters). Preserve this key across deployments. Disconnect deletes the saved connection.

Enable **Gmail API** in the Google Cloud project owning the OAuth client and add `https://www.googleapis.com/auth/gmail.readonly` to the consent screen's Data Access scopes. In testing mode, add the account under test users. Public distribution with this restricted scope requires Google's verification and potentially a security assessment; test-mode refresh grants can expire after seven days.

Scanning pages through the mailbox without a date cutoff, 30 messages per API request in batches of five. The browser continues pages until completion or Stop scan; Gmail Spam and Trash are excluded. Large mailboxes can take time and remain subject to Google API quotas. It uses sender/subject/snippet metadata to identify known merchants or recurring billing from other senders, and unambiguous INR amounts. It does not fetch attachments or full message bodies. No email bodies/attachments are stored or sent to DeepSeek. Missing/ambiguous amounts must be entered manually. Messages, senders and charge text are evidence to review, not proof of a current subscription. Google login alone does not connect Gmail.
