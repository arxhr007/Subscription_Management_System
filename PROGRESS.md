# Brightloop migration progress — 2026-10-31

Implemented Nuxt 4/Vue/Nuxt UI frontend, pnpm workspace, Supabase Auth server integration, PostgreSQL Prisma schema/migration, and DeepSeek read-only assistant. SMTP/outbox/custom JWT/password hashing removed from active app. Original React reference is in docs/legacy-react.

Verified: 18 shared tests, shared/API/Nuxt typechecking, production build, frozen pnpm installation. Disposable real PostgreSQL integration verifies migrations, concurrent invoice idempotency, discount usage limits, payment retries/concurrency, and billing catch-up before expiry closure.

All four browser checks passed, including desktop/mobile rendering and product form serialization.

Supabase project tndiaxomaorbyvttfpgr is provisioned in Mumbai; schema applied, demo dataset loaded and admin bootstrapped. Live Supabase sign-in, session profile, dashboard and logout passed. DeepSeek Flash live tool-calling passed after the user supplied the key, returning 3,582 active subscriptions and MRR matching the hosted dashboard. Follow README for credentials and bootstrap. Seed fixtures do not create Supabase logins. Do not claim hosted performance meets the two-second target; that workload has not been benchmarked.

See TODO.md for remaining work. README.md is the current setup reference; older CONTEXT.md is historical.

Live browser sign-in and sign-out through the Nuxt proxy passed. Customer signup and admin-created staff logins passed role-isolation checks. All demo credentials are in apps/api/admin-login.txt (ignored). The seed clock conflict was corrected with upsert; business rows were already loaded, and samples regenerated without resetting cloud data.

SSE proxy stream stayed open through its heartbeat after correcting disconnect handling. Both local services are running.

Gmail scan recovery: differentiated Google permission/quota/authentication errors; added bounded transient retries, paced three-message batches, and skipping messages removed during a scan. The customer scan keeps its current review list and page cursor while the page remains open, with Resume scan and a fresh-scan option. Two focused Gmail error-handling checks passed. Refreshing the browser still clears unsaved discoveries.

## HANDOFF: new personal advisor pivot (incomplete)
Read HANDOFF.md and PRODUCT_VISION.md first. New shared advisor rules, schema/migration 004, advisor API and Calendar API/OAuth source have been added. Migration 004 is NOT applied. Frontend onboarding/timeline/advisor screens are NOT built. Middleware already references missing /portal/onboarding; current source is an unfinished transition. Do not confuse older successful builds with verification of this pivot.
