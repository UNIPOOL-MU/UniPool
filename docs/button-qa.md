# Button QA — September 2026

## Confirmed defects fixed

- React Native Web implements `Alert.alert` as an empty function. Leave, remove-traveller, delete-expense, block/restrict, duplicate-trip prompts, validation messages and API errors now use a browser dialog. Native apps retain the native alert. The dialog supports multiple actions, native keyboard focus management, safe Cancel focus, Escape cancellation, queued alerts, and confirmations above existing modals.
- Confirmed-trip actions and recommendation text now stay within narrow phone widths. Owner actions say Remove traveller; traveller actions say Leave. A traveller leaving removes every corresponding card for that pool and restores cards on failure.
- Circle expenses open on a tap, with removal offered only to the creator/admin and confirmed separately.
- Browser sharing falls back to clipboard or selectable text. Cancelling a native share sheet does not unexpectedly copy text. Sharing-app errors now give feedback.
- Gender changes restore the old value and show an error when saving fails.
- Failed notification-read mutations restore unread state and show feedback. Repeated mark-all actions are disabled during the request.
- Pickup-point forms reject empty or out-of-range coordinates. Settlement forms reject non-finite or non-positive amounts.
- Failed cached reads no longer create a second unhandled rejected promise from cleanup.

## Coverage and evidence

| Check | Scope | Result |
|---|---|---|
| Source control inventory | 374 control declarations across 55 screens/components | No missing handlers or missing literal navigation destinations |
| Alert regression guard | All frontend TS/TSX imports | Direct no-op native web Alert imports rejected |
| Browser route smoke pass | 38 page/parameter combinations, including all 8 games | Rendered without page errors using isolated API fixtures |
| Browser action regressions | Leave Cancel/success/failure; owner removal; rating validation/submission; safety Cancel; expense tap/nested Cancel; sharing fallback; search-to-form; trip validation; three-action duplicate prompts; pickup validation; notification rollback; toolbar/chat navigation; export/print invocation | Scripted assertions passed |
| Responsive action reachability | Leave at 320, 390, 768 and 1280 pixels | Within the viewport |
| Backend tests | 50 tests, including self-leave, owner removal, protected owner/outsider permissions, missing traveller and API route contract | Passed |
| Frontend checks | TypeScript and Expo web export | Passed |

The optional click sweep is diagnostic interaction coverage; it is not proof that each full production workflow succeeds.

## Limits

The browser scripts block external requests and use isolated fixtures. They do not change real trips, send emails/messages, or block real users. They verify frontend request methods, payloads, navigation, confirmations, rollback and error feedback. Backend tests use fake database collections. Browser print is checked by observing its invocation; CSV is checked as an actual download. Production identity sign-in, MU verification email delivery, external sharing apps, real database persistence, push delivery and device permission dialogs require a live integration/device pass. No claim is made that those external workflows have all passed.

## Repeat the checks

From the repository root:

```sh
node scripts/qa/button-contract.cjs
```

Build/export the frontend first. Run the browser regressions with an installed `playwright-core` module and Chromium. Optional variables:

- `QA_PLAYWRIGHT_MODULE`: absolute module entry path, or default `playwright-core`.
- `QA_CHROMIUM_PATH`: optional installed Chromium binary; otherwise use Playwright's installed browser.
- `QA_SWEEP=1`: additionally click initial enabled controls on the tested routes. External identity/sharing actions are skipped.
- `QA_SCREENSHOT_PATH`: optional final mobile screenshot.

```sh
node scripts/qa/browser-actions.mjs
```

The browser script creates an ephemeral local server and closes it on completion. It blocks external HTTP traffic and mocks all API calls. It requires no real account credentials.

## Profile name navigation

Account names now open profiles from feed cards, direct chat lists/headers, group chat members/senders, people search/saved contacts, Circle members/balances/settlements/expense payers/activity, receipt travellers, leaderboard and rating/safety modals, mutual travellers and map popups. Existing trip detail/Matches/live links retain their profile navigation. Names without an account ID (for example manually entered trusted contacts) remain plain text. Selection controls for payers and feedback recipients retain their selection action.

The authenticated public-profile endpoint returns only name, username, picture, verification and academic fields. Email, phone, roll number and credentials are excluded. Browser assertions cover correct account IDs from seven surfaces, displayed academic details and missing-profile feedback/retry. The updated regression suite passed 75 checks; a final focused pass also verified all seven name-entry surfaces, keyboard Enter activation and missing-profile feedback; the backend suite passed 50 tests, including profile field allowlisting, authentication and missing accounts.

Live profile reads use the existing Supabase people service (`/profiles/{userId}`), because the Render backend has not picked up the new FastAPI endpoint. The deployed people function returns only the public directory projection; a live SQL projection check confirmed its columns, and the unauthenticated endpoint was checked for rejection. Cached-session directory sync now preserves academic/verification fields. Signed-in browser scenarios still use isolated fixtures rather than real student sessions.
