# Brightloop — revised architecture and delivery plan

Updated 2026-10-31. This plan supersedes previous stack choices. These are target decisions, not a claim that migration is complete.

## Priorities

Deliver a professional, responsive subscription management dashboard with reliable billing and clear workflows. Preserve the existing shared business logic and API rather than rewrite working code for framework consistency. Git operations remain deferred by the user.

## Selected stack

| Layer | Decision | Purpose |
|---|---|---|
| Workspace | pnpm workspaces, pinned package manager and lockfile | Reproducible installs; workspace:* internal packages |
| Frontend | Nuxt + Vue + TypeScript, current mutually compatible stable releases | File routing, layouts, middleware, typed application structure |
| UI | Nuxt UI dashboard components + Tailwind CSS | Accessible navigation, forms, tables, dialogs, consistent light/dark themes |
| Forms | Nuxt UI forms + shared Zod validation | Client feedback and authoritative server validation |
| Data | Nuxt useFetch/useAsyncData and $fetch | Avoid adding a second query framework without a demonstrated need |
| Tables | Nuxt UI table with server pagination, filtering and sorting | Bounded payloads and fast large lists |
| Charts | A Vue-compatible chart integration selected against installed Nuxt UI versions | Revenue series, aging, MRR; no React/Recharts dependencies |
| API | Existing Express + TypeScript | Preserve routes, RBAC and billing behavior |
| ORM | Existing Prisma 6, pinned compatible patch | Keep working transaction code; no unrelated major ORM migration |
| Database | Supabase hosted PostgreSQL, free plan | Managed relational database with pooling and TLS |
| Authentication | Supabase Auth with server-validated identity and application-owned roles | Roles checked on the server; no public customer linking by unverified email |
| Updates | Existing SSE + reconnect/refetch fallback | Refresh affected data after committed mutations |
| AI | DeepSeek Flash, model deepseek-flash | Optional read-only Ask Finance assistant |
| Tests | Vitest + existing backend scripts; Playwright for critical browser flows | Verify correctness, permissions and the complete demo |
| Hosting | Long-running Node services, same public origin through a reverse proxy | Existing scheduler/SSE need a persistent process |

Resolve exact frontend versions together during implementation, pin them in pnpm-lock.yaml, and verify Node engine requirements. Use the Nuxt UI dashboard template as a reference, not a reason to add unrelated dependencies.

## Scope changes

- Remove SMTP, Nodemailer, Mailpit, email outbox, email notifications, invoice email sending and AI-drafted emails.
- Remove public forgot/reset-by-email screens. Keep password change for authenticated users; define an admin-assisted recovery workflow with session revocation and audit logging. Admin recovery for a customer must not expose a reset token publicly.
- This intentionally departs from the PDF requirement for emailed password reset. Do not claim full requirement compliance; revisit if judges require it.
- Replace React, React Router, custom React forms, TanStack Query, Recharts and Vite application scaffolding with Nuxt/Vue equivalents. Nuxt handles its own build tooling.
- Replace SQLite and SQLite PRAGMAs with PostgreSQL. Keep an optional local PostgreSQL development profile; no dual-database sync or offline-write system.
- Remove authenticated API service-worker caching from the initial release. Cloud database access requires connectivity; show honest retry/error states rather than pretend the system works offline.
- Keep Time Machine and reconciliation as useful differentiators after core workflows pass.

## Database and billing reliability

Use a pooled Supabase DATABASE_URL for application traffic and a direct connection for migrations where required by Prisma/Supabase configuration. Keep secrets in server environment variables. Never expose database or AI credentials through public Nuxt runtime config.

Create and review PostgreSQL migrations; run migrate deploy for deployments. Do not use db push as the production migration workflow. SQLite-to-PostgreSQL is a real migration: review relation tables, SQL differences, seed behavior and constraints. Existing SQLite data needs a separate export/import if it must be preserved.

Preserve integer paise, unique invoice(subscriptionId, periodStart), immutable invoice price/tax snapshots, transactional number allocation, discount usage and billing pointers. Add database coordination for scheduled billing: the existing promise queue only serializes one process. Protect payment balances against concurrent updates with transaction isolation/locking and bounded retries. Introduce durable idempotency keys for payment/reconciliation submissions.

Run jobs in one designated persistent worker with PostgreSQL coordination; keep manual billing and Time Machine under the same lock. Time Machine is admin-only demo functionality and must be disabled in normal production. Bound catch-up workloads and report progress/failures.

Index observed filters and stable sorting keys; paginate on the server. Retain page-number pagination for small bounded datasets; use cursor pagination where measurements justify it. Measure actual end-to-end page latency, including cold database starts, rather than presenting API timing as proof of the PDF's two-second requirement.

Supabase Free is a development/hackathon budget choice, not an availability guarantee. Account for storage/compute limits and scale-to-zero latency. Select API and DB regions close together. Verify current quotas before seeding thousands of records.

## Security and AI

Enforce admin/staff/customer permissions in the API and scope all portal queries to the authenticated customer. Never attach a public signup to an existing customer merely because the supplied email matches; without email verification, existing profiles require an admin-controlled invitation/linking process.

Use secure HttpOnly SameSite cookies in production, explicit origin/CSRF checks for mutations, revocable sessions and password-reset/session invalidation. Validate all inputs server-side, limit request sizes and expensive endpoints, and redact secrets from logs.

DeepSeek is server-only: DEEPSEEK_API_KEY, DEEPSEEK_MODEL=deepseek-flash, base URL https://api.deepseek.com. Use the documented compatible chat API and a bounded read-only tool loop. Validate tool arguments with Zod and enforce authorization independently of model instructions. No raw SQL, financial writes, automatic payment decisions or email tooling. Keep answers grounded in returned data with links to relevant records. Bound latency, tool calls, tokens and retries; handle timeout/rate-limit errors without affecting normal billing. No key means the feature is unavailable, not a broken dashboard. Confirm the installed SDK's compatibility before reusing existing Anthropic helpers.

## Dashboard and workflows

Use Nuxt UI dashboard sidebar/navbar/panels with breadcrumbs, consistent spacing, keyboard access, clear status labels, accessible contrast and responsive layouts at 375px. Every data view needs loading, empty, error and retry states; validate dialogs and disable duplicate submissions.

Navigation: Overview; Sales (Subscriptions, Templates, Renewals, Customers); Billing (Invoices, Payments, Reconciliation); Catalog (Products, Plans, Taxes, Discounts); Admin (Team, Import). Customer portal has its own restricted layout. Admin controls catalog writes and discounts; staff operate subscriptions and billing.

Primary workflow: login → create product/variant and plan → template/quotation → confirm/activate subscription → invoice with tax/discount → confirm invoice → partial/full payment → finance dashboard. Customer sees only their subscriptions/invoices. Invoice printing uses browser print styling; invoice sending by email is excluded.

Dashboard: active subscriptions, MRR/ARR, cash collected, outstanding/overdue, renewals; monthly revenue/collections, aging, plan breakdown, filters and linked drilldowns. Clearly distinguish recurring revenue from collected cash.

## Migration sequence

1. Record baseline checks and preserve billing/shared logic; do not trust historical pass claims without rerunning.
2. Configure pnpm-workspace.yaml, workspace:* dependencies, pinned pnpm, pnpm-lock.yaml, CI frozen installs and updated scripts. Remove package-lock.json only when pnpm install succeeds.
3. Scaffold Nuxt/Nuxt UI in apps/web; build layouts, login and role guards; proxy /api and SSE to Express under the same origin. Disable SSR for authenticated dashboard routes initially unless request-scoped cookie forwarding and isolation are verified.
4. Configure Supabase PostgreSQL, remove SQLite initialization, generate migrations, verify seed on a disposable database. Connection provisioning requires the user's database credentials; never reset an existing DB implicitly.
5. Remove mail routes/dependencies/schema/UI; implement secure recovery alternative. Replace Anthropic configuration with DeepSeek and verify with the supplied key.
6. Build core staff and customer workflows, then dashboard, Time Machine and reconciliation. Drop command palette and AI polish first if delivery is at risk.
7. Run unit/API checks, concurrent billing/payment checks, RBAC/ownership checks, browser flows, production build and responsive QA. Use throwaway DBs for scripts that mutate records or move the clock.
8. Document setup, environment variables, migrations, seed, actual demo logins, deployment topology and measured performance.

## Acceptance gates

- pnpm install --frozen-lockfile, typecheck, tests and production build pass.
- Invoice reruns and concurrent billing create no duplicate periods; discount limits and payment balances remain correct under contention.
- Cross-customer access and staff admin actions fail; recovery revokes prior sessions.
- The complete primary workflow works on desktop and mobile with live data.
- 5,000 subscriptions dataset tested within free-plan quotas; warm and cold latency reported separately against the two-second target.
- DeepSeek failure does not break billing; no key appears in browser bundles or logs.
- No email/outbox dependency remains in the migrated app; documented PDF deviation is explicit.

## Reference documentation

- Nuxt UI: https://ui.nuxt.com/docs/getting-started/installation/nuxt
- Supabase plans and current quotas: https://supabase.com/pricing
- DeepSeek official model and API: https://api-docs.deepseek.com/en/

## Current implementation status

Nuxt UI, pnpm, Supabase Auth/PostgreSQL, and the DeepSeek adapter are implemented. Supabase project tndiaxomaorbyvttfpgr is provisioned in Mumbai, migrations applied and demo data loaded. Local tests and live Supabase authentication passed; see PROGRESS.md for exact validation and TODO.md for unfinished polish. DeepSeek live tool-calling is verified with the supplied API key.
