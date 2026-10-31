> **Migration implemented:** Read README.md, PROGRESS.md and TODO.md for the current pnpm/Nuxt UI/Supabase setup. Supabase is provisioned and live auth verified. The older context below is historical.

> **Architecture update — 2026-10-31:** Read `PLAN.md` first. The new target is Nuxt/Vue + Nuxt UI, pnpm, the existing Express/Prisma backend with Supabase PostgreSQL, and DeepSeek Flash (`deepseek-flash`). Email/SMTP/outbox features are removed from scope; this intentionally departs from the PDF email-reset requirement. The older notes below describe the previous implementation and are historical where they conflict. The code migration is pending; this documentation update does not mean it has been implemented.

# Brightloop — FULL SESSION CONTEXT (read this first)

This file carries over everything from the original Claude Code session, so a new session or account can continue with no other history.

Read in this order:
1. **CONTEXT.md** (this file): why, constraints, decisions, gotchas, API reference
2. **PROGRESS.md**: what is built, file by file, and what was verified
3. **TODO.md**: what's left, as a checklist, plus the demo script
4. `docs/PLAN.md`: the approved hackathon plan (`docs/plan.html` is its styled version; `Hackathon_Plan.pdf` is the printed copy)

---

## 1. The user and their request

- The user is on a **team of 4** competing in the **Odoo Hackathon**: **8-hour virtual round**, everyone gets the same problem statement.
- Their messages, in order:
  1. "Plan the hackathon differently from normal people. Don't do anything git-related for now. Research new tech, offline solutions, anything that makes our project stand out." They also asked to gather recent hackathon-winning projects and to identify existing apps with their strengths and weaknesses, with headings, bullets and cited sources.
  2. Answers to clarifying questions: **8h virtual, 4 people**; **mixed stack / no preference**; **cloud AI is fine**.
  3. Approved the plan, then asked: "write the plan to pdf". Done: `Hackathon_Plan.pdf` (rendered from `docs/plan.html` with headless Chrome).
  4. "implement the plan". The build is in progress; the backend is done.
  5. Interrupted, asked to write progress and todo into md files ("switching Claude sessions"), then asked for this full-context file ("moving the entire session and Claude organization").
- Preferences:
  - Git: **do not do anything with git yet**. The user deferred it, even though organizers grade "proper git use by all members".
  - Communication: the session had a "caveman" terse-reply plugin active, so the user is fine with short answers.
  - Workflow: the user writes informally and with typos; infer intent.
- User email (for attribution only): sankardas.devadas@gmail.com

## 2. Hackathon rules (pasted by the user, verbatim intent)

**Must have**
- Use real-time or dynamic data sources; avoid relying on static JSON except for initial prototyping.
- A responsive, clean UI with a consistent color scheme and layout.
- Robust validation of user input.
- Intuitive navigation with proper menu placement and spacing.
- Proper use of version control (Git): one member managing the repo is not enough.

**Nice to have**
- Ability to design backend APIs, model data and set up a local database.
- Understand AI-generated or copied code snippets thoroughly before using them; adapt them to the project instead of blindly copy-pasting.
- Plan for offline or local solutions; don't rely entirely on internet connectivity or cloud tools.
- Use trendy technologies only if they add real value.

Odoo judging (from research): technical accuracy, problem complexity and algorithmic skill. Also: a finished, simpler project beats an unfinished, ambitious one.

## 3. Problem statement (from `Subscription_Management_System.pdf`, by Odoo)

"Subscription Management System — build one system to run plans, subscriptions and recurring billing in one place." The fictional company is **Brightloop Software**.

**Today:** subscriptions are tracked in a spreadsheet, renewals are remembered by whoever notices, invoices are typed by hand, payments are matched by scrolling bank statements, and revenue reports are built manually each quarter.

**Scenes / requirements:**
1. **Signup and auth**
   - Email plus password; each email can belong to only one account.
   - The password must be **more than 8 characters**, with an uppercase letter, a lowercase letter and a special character.
   - Forgot password sends a reset link to the registered email.
   - Roles: **admin** (whole system), **internal staff** (limited, day-to-day), **customers** (portal with their own subscriptions and invoices only).
   - **Only the admin adds staff.**
2. **Products and plans**
   - Products have name, type, sales price, cost price and notes, plus **variants**. Example: choosing the **Odoo brand adds 560** to the price.
   - Plans have price, billing period (**daily, weekly, monthly or yearly**), **minimum quantity** and **availability dates**.
   - Some plans **auto-close when they end**; others can be **closed early, paused or renewed**. The admin decides per plan.
3. **Quote to subscription**
   - **Quotation templates** hold the plan and product lines and stay **valid for N days**.
   - A subscription has a number, customer, plan, start date, expiry date and payment terms.
   - Lines have product, quantity, unit price, taxes and amount.
   - Status flow: **Draft → Quotation → Confirmed → Active → Closed**, visible to the whole team.
4. **Billing day**
   - Hundreds of invoices are generated from subscriptions automatically: customer, lines, taxes and totals are prefilled.
   - **Taxes are calculated automatically** from the admin's rules.
   - Staff can confirm, cancel, send or print an invoice.
   - Invoice flow: **Draft → Confirmed → Paid**.
   - **Nothing is billed twice or skipped.**
5. **Discounts (admin only)**
   - Fixed amount or percentage, with a minimum purchase or quantity, start and end dates, and a **usage limit**.
   - Applies to specific products or to whole subscriptions.
   - **Appears on the next invoice automatically**, and **stops when it expires or runs out.**
6. **Payments**
   - Recorded with method, amount, date and a note, against an invoice.
   - Staff can see paid vs outstanding invoices and chase overdue ones.
7. **Finance lead**
   - One place for active subscriptions, revenue, payments and overdue invoices, with **filters and a summary view**.
   - **Every page under 2 seconds with thousands of subscriptions.**

## 4. Research summary (cited in `docs/PLAN.md`)

- No public list of past Odoo hackathon winners exists. Format: surprise problem statement, 8h virtual round, then a 24h offline final. Odoo Hackathon 2025 had 18,000 registrants.
- Competitors:
  - **Odoo Subscriptions** (the judges' own product): heavy ERP interface; reconciliation lives in the separate Accounting module.
  - **Chargebee**: closed-source, cloud-only, expensive.
  - **Stripe Billing**: has Smart Retries but locks you into Stripe and suits developers more than ops staff.
  - **Lago**: open source and usage-based, but a thin business interface and less tax automation.
  - **Kill Bill**: dated interface, runs on the JVM.
  - **Zoho / Recurly**: cloud-only.
- **Gap we exploit:** nobody lets ops staff *rehearse a billing month* or turn a bank CSV into matched payments in one click.
- Tech chosen only where it adds value: shared Zod schemas (validation), SSE (real-time), a local DB, a local mail outbox (offline), a PWA portal (offline), and a cloud LLM over read-only tools that hides itself when offline.
- Skipped on purpose:
  - PGlite/ElectricSQL sync: too risky for 8 hours.
  - WebLLM: about a 700 MB model download.

## 5. The pitch ("Kill every spreadsheet")

| Today's pain | Our feature |
|---|---|
| Spreadsheet of subscriptions | CSV import wizard with a per-row error report |
| Renewals forgotten | Renewal radar, plus auto-renew / auto-close by plan flags |
| Invoices typed by hand | One-click / scheduled billing run, idempotent via UNIQUE(subscriptionId, periodStart) |
| Bank-statement matching | Reconciliation: upload a CSV, scored auto-match, confirm in one click |
| Quarterly manual reports | Live finance dashboard (MRR, ARR, aging, churn) over SSE |

**Signature feature: ⏩ Time Machine**, an admin-only virtual clock. Fast-forwarding a day, week or month runs billing, renewals, auto-closes and overdue invoices live.

Extras:
- Ctrl+K command palette
- Audit timeline
- Next-invoice preview, which shows discounts auto-applying
- "Ask Finance" AI
- Speed badge showing the server time per query

## 6. Key technical decisions and why

- **Monorepo with npm workspaces:** `packages/shared` (Zod schemas, billing engine, recon, money), `apps/api` (Express 5 + Prisma 6 + SQLite), `apps/web` (Vite 6 + React 19 + Tailwind 4).
- **SQLite instead of Postgres:** Docker Desktop isn't running and Postgres isn't installed. SQLite also suits the offline requirement. To switch, change one line plus `DATABASE_URL`.
- **Money in integer paise.**
  - Forms submit rupee strings.
  - The shared schemas' `zMoney()` converts them to paise in the API.
  - The frontend validates with the same schema but **sends the raw values**. Never send the parsed output, or the amounts get converted twice.
- **Built-in outbox instead of Mailpit:** every email is stored in the `Email` table. `SMTP_URL` sends for real. `DEV_MAILBOX_PUBLIC=true` exposes the outbox without login (dev only).
- **Billing correctness:**
  - `Subscription.nextInvoiceDate` is the pointer.
  - Each period is invoiced in its own transaction, with the number sequence, discount `usedCount` increment and pointer move done together.
  - The unique key blocks duplicates.
  - Catch-up loops through missed periods.
  - Billing stops at `expiryDate`.
  - Jobs are serialized with a promise chain (`runAllJobs`).
- **Pricing order (`priceInvoice`):**
  1. Line subtotal.
  2. Best product-scope discount per line.
  3. Best subscription-scope discount, spread pro rata with `allocate()` so no paisa is lost.
  4. Per-line tax from the rules matching the product type.
  - Discount validity is checked at `periodStart`.
- **Plan base fee:** `Plan.price` is an optional per-period base fee, added as a first line ("plan fee"). Product lines carry their own unit prices: product sales price + variant extra, or an override.
- **Renewal:** extends expiry by the original term, counted in whole plan intervals.
- **Lifecycle:**
  - Confirming with a start date ≤ now activates immediately.
  - Quotations expire into CLOSED.
  - At expiry, an auto-close plan → CLOSED. Otherwise, if autoRenew is on and the plan is renewable, the subscription renews. Otherwise it stays open, stops billing, and shows in the renewal radar.
- **Auth:**
  - JWT in the httpOnly cookie `bl_session` (7 days); the user is reloaded from the DB on every request.
  - bcryptjs.
  - In-memory rate limits on login, signup, forgot and reset.
  - Reset tokens are stored as sha256 hashes, valid 1 hour and single-use. Forgot always returns the same neutral message.
- **AI ("Ask Finance"):**
  - `@anthropic-ai/sdk` 1.3.0, `client.beta.messages.toolRunner` with `betaZodTool`, model **`claude-haiku-5-5`** (named in the approved plan for speed), `output_config.effort: 'low'`, `max_iterations: 6`.
  - Only read-only tools; no SQL.
  - Typed SDK errors map to 503/429/502.
  - `GET /api/ai/status` lets the UI hide the feature.
  - No `ANTHROPIC_API_KEY` is set yet.
- **Security upgrades applied:** zod 4.6.7 (schemas migrated to v4 `{ error: '...' }` syntax), nodemailer 10.3.1, vitest 5.0.5, express 5.3.
  - **Remaining:** a dev-only `deepmerge-ts` advisory under the Prisma 6 CLI. It is accepted because Prisma 7 is a large migration.

## 7. Gotchas learned (save time)

- **Prisma force reset:** `prisma db push --force-reset` refuses to run when invoked by an AI agent unless the user gives explicit consent (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). **Ask the user to run `npm run db:reset -w apps/api` themselves.** For a fresh, empty DB, `npm run setup` (non-destructive) works.
- **Express 5 types:** `req.params.id` is typed `string | string[]` on routes with extra middleware (for example `adminOnly`), so `catalog.ts` uses `String(req.params.id)`.
- **Prisma relations:** the schema needs back-relations (`Product.lines SubscriptionLine[]` was added).
- **Field comparisons:** Prisma 6 supports them, e.g. `expiryDate: { gt: prisma.subscription.fields.nextInvoiceDate }`, used in runBilling.
- **Shell heredocs:** on this Windows Git Bash, heredocs containing quotes plus `\'` broke. Write files with the Write tool instead.
- **Seed:** deterministic PRNG, ~20 s. It writes `samples/` through `apps/api/scripts/samples.ts`. Rerun `npm run samples -w apps/api` before a demo so the bank CSV matches the currently open invoices.
- **e2e script:** `apps/api/scripts/e2e.mjs` mutates data: it creates records and advances the clock +62 days, then resets it. Run it only on a throwaway DB, then reseed.
- **Time Machine cost:** a +30d jump from the fresh seed state created ~4,000 invoices, each in its own transaction. It wasn't timed and may take several seconds; the UI needs a spinner.
- **Dashboard speed:** ~380 ms, lists 11–17 ms, with 5,000 subscriptions and ~24,000 invoices.

## 8. API reference (all under `/api`; JSON; cookie session)

Responses:
- Errors look like `{ error, fields? }`: 400 for validation (fields keyed like `lines.0.quantity`), 401, 403, 404, 409 (conflict or illegal transition), 429.
- Lists return `{ items, total, page, pageSize, summary? }`, with query params `page`, `pageSize`, `q`, `status`.
- Every JSON response carries the `X-Response-Time` header (ms).

| Area | Endpoints | Who |
|---|---|---|
| Auth | POST `/auth/signup` `/auth/login` `/auth/logout` `/auth/forgot` `/auth/reset`; GET `/auth/me` | public / any |
| Team | GET, POST `/users` | admin |
| Events | GET `/events` (SSE `changed` → `{topics}`) | any logged in |
| Customers | GET `/customers`, `/customers/options?q`, `/customers/:id`; POST; PUT `/:id` | staff |
| Products | GET `/products` (`?status=active`), `/products/:id`; POST, PUT (variants replaced) | read staff / write admin |
| Plans | GET `/plans`; POST, PUT `/:id` | read staff / write admin |
| Taxes | GET `/taxes`; POST, PUT | read staff / write admin |
| Discounts | GET `/discounts`; POST, PUT (`productIds`, `subscriptionIds`) | read staff / write admin |
| Templates | GET, POST `/templates`; PUT, DELETE `/:id` | staff |
| Subscriptions | GET `/subscriptions` (`planId`), `/subscriptions/counts`, `/subscriptions/options?q`, `/subscriptions/:id` (includes `nextInvoice`, `timeline`, `invoices`, `now`); POST; PUT `/:id`; POST `/:id/transition {to}`, `/:id/renew`, `/:id/invoice`; PATCH `/:id/auto-renew {autoRenew}` | staff |
| Renewals | GET `/renewals?days=` | staff |
| Invoices | GET `/invoices` (status `DRAFT\|CONFIRMED\|PAID\|CANCELLED\|OVERDUE\|OUTSTANDING`, `customerId`), `/invoices/:id` (includes `amountDue`, `overdue`, `timeline`); POST `/:id/confirm` `/:id/cancel` `/:id/send` | staff |
| Billing | POST `/billing/run` → summary | staff |
| Payments | GET `/payments` (status = method); POST `{invoiceId, method, amount, date, note}` | staff |
| Reconcile | POST `/reconcile/preview {csv}` → rows with candidates/autoInvoiceId/error; POST `/reconcile/confirm {matches[]}` | staff |
| Dashboard | GET `/dashboard?months=3\|6\|12&planId=` | staff |
| Clock | GET `/clock`; POST `/clock/advance {days}`, `/clock/reset` | any / admin |
| Import | POST `/import/subscriptions {csv, commit}` | staff |
| Outbox | GET `/outbox?to=` | admin (or public if `DEV_MAILBOX_PUBLIC=true`) |
| Portal | GET `/portal/overview`, `/portal/subscriptions/:id`, `/portal/invoices/:id`; POST `/portal/subscriptions/:id/action {accept\|pause\|resume\|close\|renew}`, `/portal/invoices/:id/pay {method: CARD\|UPI}` | customer |
| AI | GET `/ai/status`; POST `/ai/ask {question, history[]}` | staff |

## 9. Environment (the user's machine)

- Windows 11, Node 22.20, npm 10.9.
- Shells: Git Bash and PowerShell.
- Docker Desktop is installed but was not running.
- Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe` (used headless to print PDFs); poppler is installed.
- Project root: `C:\Users\aaron\Videos\hackathon`. It contains the original `Subscription_Management_System.pdf` and `Hackathon_Plan.pdf`.
- The API dev server (`tsx watch`, port 4000) was started in the background in the old session. It may still be running; on Windows, stop it with `Stop-Process` on whatever process owns port 4000.

## 10. Next step

Start with `TODO.md` §1, the app shell: TimeMachine, CommandPalette, AskFinance, Layout, main.tsx and App.tsx routes. Then the pages, the build, Express serving `apps/web/dist`, a README, and a browser walkthrough at 375px.
