# Personal Subscription Intelligence Advisor

This supersedes the Brightloop business-billing product plan. The product helps people align subscriptions with their schedules, interests and self-reported usage. It optimises value, not cancellation counts.

## First complete product slice

1. Adaptive personal onboarding: occupation, interests, monthly budget and upcoming activities.
2. Active / Planned / Interested / Inactive subscriptions with category, importance and self-reported usage.
3. Manual activities and optional read-only Google Calendar integration.
4. Intentions tied to a service, a reason and an activation window.
5. An advisor home answering what to do next, with evidence and financial impact.
6. A central weekly/monthly/quarterly timeline combining activities, renewals and intentions.
7. Explainable, deterministic recommendations with keep, subscribe, delay and reconsider actions; overlap prompts never assume redundancy.
8. Feedback and dismissals; no automatic purchases, cancellation, subscription activation or calendar writes.
9. Budget and category breakdown, projected costs, and clearly labelled potential (not actual) savings.

## Truthfulness boundaries

Receipt discovery does not establish actual usage or current provider status. Usage is user-reported. Calendar titles are context, not instructions to buy. Unknown dates/prices remain unknown. No claimed savings until an actual confirmed change can be measured. Calendar data stays server-side; raw event content is not sent to an LLM.

## Later capabilities requiring separate delivery

Verified release/offer feeds with source, market and freshness metadata; provider-specific pause/cancellation policies; browser/mobile notifications; scheduled background advice; advanced feedback ranking; longitudinal usage integrations; freemium billing. No fabricated catalogue pricing or releases to fill these gaps.

## Existing foundation

Retain Nuxt UI dashboard template/theme, Supabase Auth/PostgreSQL, user-owned subscription records, optional Gmail discovery and secure OAuth. Remove business/accounting navigation from the personal product. Preserve older business data and routes until a deliberate data-retirement decision.

## Delivery checks

Use a small set of recommendation-rule tests and build/type checks. Manual verification follows onboarding → activity → intention → recommendation → feedback → timeline. Google Calendar requires the user to enable Calendar API, approve read-only scope and consent.
