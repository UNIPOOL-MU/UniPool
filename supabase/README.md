# UniPool Supabase

UniPool uses a dedicated Supabase project (`jwodrevycbzlcukkoaps`, Mumbai/ap-south-1) for shared-state features that should not depend entirely on the legacy Render mobility API.

## Production Edge Functions

The following functions are active in production:

- `unipool-shared` — Circles, shared expenses and settlements, personal transactions, direct/group chat persistence, presence/typing, and legacy chat import.
- `unipool-utility` — user directory/email lookup, Circle email invites, restricted-user relations, and policy-consent records.
- `unipool-people` — student discovery, saved people, trusted contacts, notifications, campus events, and Campus Home aggregates.
- `unipool-trip` — saved-route watches, trip state, final fare, temporary live location, and trip polls.
- `unipool-circle-plus` — recurring Circle expenses, expense comments, reminders, Circle chat, polls, and linked rides.
- `unipool-games` — Time-Pass progress, XP/profile aggregation, and leaderboards.
- `unipool-route-alerts` — saved-route matching and route-alert notification delivery.
- `unipool-feedback` — post-trip structured feedback and trust summaries.
- `unipool-money-v3` — budgets, trip matching preferences, and converting final trip fares into Circle expenses.
- `unipool-routing` — authenticated road-route geometry with OpenRouteService and OSRM fallback.

`unipool-shared`, `unipool-utility`, and `unipool-routing` are mirrored under `supabase/functions/` in this repository. Other active functions should be mirrored before they are next changed so GitHub remains the canonical source alongside the production deployment.

## Circle invite delivery

`unipool-utility` supports real transactional Circle invite email delivery. Direct delivery is enabled when either of these secret pairs is configured in the Supabase function environment:

- `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL`

When neither provider is configured, the invite record is still created and the frontend falls back to the existing email-composer flow. Provider credentials are deliberately not stored in Git.

## Security model

- UniPool Supabase tables use RLS.
- Browser-facing table access is not used for protected product data; the frontend calls Edge Functions.
- Edge Functions use the service role internally and validate the existing UniPool bearer session before authenticated operations. Public `/health` routes are intentionally unauthenticated.
- The Supabase project is separate from other applications and must not share application tables or credentials with them.
- Never commit Supabase service-role keys, SendGrid/Resend keys, routing-provider keys, or other deployment secrets.

## Migration state

Supabase is already the primary home for newer shared-state capabilities such as Circles, money tools, direct chat, directory/discovery state, notifications, trip coordination state, route watches, games progress, and policy consent. Some legacy mobility/auth flows still rely on the Render API, and several Edge Functions intentionally use it for session verification or compatibility while that migration remains in progress.

The canonical database schema is managed through Supabase migrations. Production currently includes Circle/expense tables, personal transactions and budgets, chat/presence tables, directory/session cache, email invite records, user relations, policy consents, saved people/trusted contacts, notifications/events, route watches, trip state/live state/polls, game progress/events, and structured trip feedback.
