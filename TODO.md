# Migration checklist

Target: Nuxt UI + Vue, pnpm, Supabase PostgreSQL and Auth, DeepSeek Flash.
Checked items require implementation and verification; cloud checks remain pending until account authorization.

## Foundation
- [x] Select target stack and preserve shared billing engine.
- [x] Complete pnpm install, lockfile, scripts and dependency cleanup.
- [x] Replace React app with Nuxt UI application and production API proxy.

## Supabase
- [x] Connect account and create a new Brightloop project (Mumbai).
- [x] PostgreSQL schema, migration and private application tables.
- [x] Supabase Auth login/signup/logout and server identity validation.
- [x] Server-owned roles, customer isolation, admin-only staff creation.
- [x] Bootstrap admin and safe demo seed.
- [x] Apply schema and verify live authentication/database access.

## API
- [x] Remove email/outbox/password-reset mail code.
- [x] DeepSeek Flash read-only assistant with bounded tools and errors.
- [x] PostgreSQL billing/payment concurrency protection.

## UI
- [x] Responsive dashboard layout and authentication screens.
- [x] Dashboard, catalog, customers, subscriptions, templates and renewals.
- [x] Invoices, payment recording, printable invoice and reconciliation.
- [x] Customer portal, team management, import and Time Machine.
- [x] Loading/error/empty states and role-aware navigation.

## Verification
- [x] Shared tests, API typecheck, Nuxt typecheck and production build.
- [x] PostgreSQL migration and concurrency checks on a disposable local server.
- [x] Live Supabase Auth and hosted PostgreSQL verification.
- [x] Four production-build browser checks passed at desktop/mobile sizes.
- [x] README and handoff notes reflect actual implementation.

Email delivery is deliberately excluded by user request despite the PDF requirement. No cloud setup is considered complete until verified.

Remaining product polish: template edit/delete controls, auto-renew toggle UI, full dashboard filters/plan breakdown, and authenticated password recovery. These are outside basic stack conversion and remain unverified.

Cloud project: `tndiaxomaorbyvttfpgr`, region `ap-south-1`. Hosted data: 1,500 customers, 5,000 subscriptions, 24,260 invoices, 21,461 payments. Administrator credentials are in the ignored, mode-600 file `apps/api/admin-login.txt`.

- [x] Configure and verify a live DeepSeek Flash tool-calling request against hosted data.

Live checks also passed for UI sign-in/sign-out through the Nuxt proxy, customer/staff role isolation, and SSE heartbeat through the proxy. Frontend runs on localhost:3000; API on localhost:4000.

## External subscriptions
- [x] Customer-only manual tracking, editing, removal, cost estimates and renewal alerts.
- [x] Bank CSV suggestions requiring review; provider management links.
- [x] Cloud migration and live customer CRUD verified.
- [x] Google PKCE callback, conditional login button and Supabase callback allowlist.
- [x] Supply Google OAuth credentials and enable the Supabase Google provider.
- [ ] User completes first Google browser sign-in (provider availability verified).

Verification limited at user request: no further broad test runs.

## Gmail discovery
- [x] Separate read-only Gmail consent, bound to the signed-in customer.
- [x] Encrypted provider token storage and refresh.
- [x] Bounded receipt scan with source links and review before save.
- [x] Applied cloud migration; five focused parser checks pass.
- [ ] Customer completes Connect Gmail consent and verifies a real mailbox scan.

## Mailbox-first personal tracker
- [x] Removed customer CSV upload and its preview endpoint.
- [x] Scan mailbox history page by page, with progress and Stop scan.
- [x] Deduplicate suggestions by service and keep the latest receipt.
- [x] Review existing services as updates instead of duplicate records.
- [x] Recognize additional recurring-billing senders; uncertain amounts require review.
- [ ] Customer grants Gmail access and runs a live mailbox scan.

## Customer UX redesign
- [x] Unified subscription landing page at /portal; removed internal/external navigation labels.
- [x] Inbox onboarding → scan progress → discoveries → review → management list.
- [x] Search and status filters; detail-first management drawer and separate editing.
- [x] Connection settings moved out of the main content; manual entry remains optional.
- [x] Existing invoice access under Billing; old tracker URL redirects to the landing page.
- [x] Build/typecheck and focused onboarding/list/detail visual checks passed.

## New product supersedes the checklists above
Read HANDOFF.md, PRODUCT_VISION.md and PLAN.md. Implement the Personal Subscription Intelligence Advisor; the current pivot is unfinished and unverified. Migration 004 is pending, and onboarding/advisor/timeline/intentions/preferences UI still need implementation.
