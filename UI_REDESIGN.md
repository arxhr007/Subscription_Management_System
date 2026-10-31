# Advisor interface update

## Current interface

The neobrutalist styling below has been superseded by a minimal system-font interface with blue actions, neutral surfaces, subtle separators and rounded panels. The timeline now uses ActivityCalendar, a full month grid with activities, renewals and planned-start filters. Subscriptions are grouped by lifecycle status. Recommendations retain acknowledged advice, provide baseline review prompts, and allow users to restore dismissals.

Google Calendar now requests calendar.readonly to list and import primary and selected secondary calendars, with pagination, recurring instances, and a 90-day history/one-year future window. Existing calendar.events.readonly connections must reconnect. A live Google consent and sync still needs user verification; automated browser coverage uses fixtures.

The active personal advisor uses a cream, ink and olive visual system with structural borders, offset shadows, compact controls and stronger type hierarchy. Shared styles also apply to the business workspace.

Updated surfaces: advisor overview and spending chart, recommendations with action filters and financial impact explanations, calendar/timeline, subscription management, plan, preferences and login copy.

Behavior corrections:
- Same-category services prompt comparison; they do not imply duplication, a rotation schedule or savings.
- High reported usage and importance protect services during exams.
- Setup no longer invents renewal dates. Active services can have an unknown renewal date; these cannot contribute to date-based cash-flow projections.
- Calendar trailing dates are sequential and multi-day activities appear across their duration.
- Budget usage can exceed 100%; a zero budget receives a separate warning.
- Potential savings in the overview are deduplicated by subscription.

Verification: 36 unit tests, shared/API/web typechecking, production build, and fixture-based desktop/mobile checks of the advisor, recommendations, timeline, subscriptions and preferences. Screenshots are under test-results. Browser fixtures do not verify live Google or Supabase integrations. Business pages inherit the shared design system but were not individually redesigned in this update.
