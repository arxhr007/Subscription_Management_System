# Personal Subscription Intelligence Advisor — accepted product requirements

This is the NEW product. It replaces the Odoo/Brightloop company-billing direction. The full user specification is in the conversation immediately before the handoff request; this file preserves its requirements in compact form.

**Subscriptions should adapt to people's lives, not the other way around.**

A personal advisor uses schedule, interests, lifestyle, self-reported usage and budget to recommend which services are worthwhile, when to activate them and when to reconsider them. It optimises value, not cancellation counts. It must work for students, professionals, freelancers/creators and general consumers.

## Onboarding

1. Profile: name, occupation, primary activities, interests, approximate monthly subscription budget. Adapt questions to occupation.
2. Multiple/custom interests: entertainment, education, productivity, technology, hobbies.
3. Existing/considered services: **Active, Planned, Interested, Inactive**. Category, price, frequency, renewal if applicable, expected usage, reason, personal importance; custom services/categories supported.
4. Optional permission-based Google Calendar; manual events must work independently.
5. Initial assessment: recurring expenditure, renewals, plans, overlaps, upcoming activities and useful next actions.

## Core intelligence

- Exams, projects, hackathons, vacations, travel, learning and work periods inform advice, never automatic purchases.
- Also support controlled interest/release opportunities eventually: series/movies, games, courses, offers and launches. These need verified external data; do not fabricate feeds/prices/dates.
- Actions: **Subscribe, Keep, Reconsider, Pause/Cancel, Switch, Delay**.
- Every recommendation explains what, why, relevant activity, financial impact and what happens if ignored.
- Frequent actual/reported usage and personal importance should protect useful services from simplistic cancel advice.
- Same-category overlap does not prove duplication. Compare purposes, unique features, preference and usage.
- Feedback: acknowledge, dismiss, not relevant, helpful, corrected assumptions; progressively respect preferences without pretending a machine-learning model exists.
- Potential savings must be labelled potential; never claim actual savings from displaying/accepting a suggestion.

## Main experiences

- Advisor home answers **“What should I do with my subscriptions right now?”**
- Central timeline/calendar: weekly, monthly, longer-term views of activities, active/planned services, activation intentions, renewals, decision dates, releases and expected spend.
- Intentions: intended service, reason, activation period, duration, estimated cost, related activity and status. Follow up on whether user actually subscribed.
- Spending: monthly/yearly, categories, budget comparison, payment timing and planned commitments.
- Proactive but limited contextual alerts: before activities/renewals and after projects; avoid repeated dismissed advice.
- Preferences/interests editable at any time; calendar optional and revocable.
- Modern, minimal, personalised UI. Keep the approved **official Nuxt UI dashboard template**, Public Sans, green/zinc theme. Do not turn it back into an accounting app.

## Safety and truthfulness

Never purchase, cancel, pause, change payments or edit provider billing automatically. User decisions occur at providers. Receipt discovery cannot establish actual usage/current plan status. Usage is self-reported unless an explicit integration supplies it. Unknown prices/dates stay unknown. No calendar/email data sent to a model without separate clear consent. No commercial bias from future partnerships.

## Long-term business

Freemium basic tracking/calendar/alerts; premium deeper forecasting/personalisation; optional independent partnerships. Do not implement monetisation before the core advisor journey works.

## Canonical demo journey

Onboard a user → add exam/project/vacation events → add active and interested services → express an intention → see an explainable keep/activate/delay/review recommendation → inspect timeline and budget → dismiss/correct advice. Google Calendar and Gmail enhance the journey; manual entry remains fully usable.
