# Local UI verification

Date: 2026-09-25. Branch: `dev`, with the uncommitted readability changes over `e73f3ea`.

## Environment

- Started with `npm run db:migrate`, then `LATER_PRODUCTION=0 npm run dev -- --host 127.0.0.1`.
- URL: `http://127.0.0.1:4173/`. Local D1 only; pending migration
  `0002_library_operations.sql` applied. No sample fixtures or remote migrations.
- Existing local-development identity bypass enabled. The login button enters the local
  app, but this is not a GitHub or Cloudflare Access authentication test.
- Automated Chromium interactions at desktop size and 390×740, 280×320 and 740×390.
  These are viewport checks, not physical Android, touch or virtual-keyboard tests.

## Browser checks

| Area | Observed result |
| --- | --- |
| Capture validation | Invalid input rejected and URL field focused. |
| Metadata failure | `.invalid` preview failed; saving retained the exact URL and note. |
| Duplicates | Duplicate save returned 409; viewing the existing item retained its original note. |
| Real metadata | A disposable `example.com` URL reached `ready` with title `Example Domain`; its note remained intact. |
| Editing/persistence | Title, note and tags saved through the UI and survived reload. |
| Search/filter | Text search, no-result state and tag filtering worked. |
| Lifecycle | Disposable item moved through Library, Finished, Archive and back to Inbox. |
| Details/mobile | Short note used a compact sheet with no internal scrolling. Long note scrolled inside the sheet; Close and Open original stayed reachable at 280×320. Mobile Actions opened the editor and focused the textarea; footer Save worked. |
| Navigation | Hamburger selection closed the menu; Escape closed details. No horizontal document overflow observed at the checked mobile/landscape sizes. |
| Confirmation | Delete-all stayed disabled for empty/partial confirmation and enabled for exact `DELETE ALL`; canceled without deletion. At 280×320 the dialog scrolls internally, bringing both buttons into view. Single-item cancel and actual deletion tested only on a disposable item. |
| Appearance | All six palettes and System selected successfully, with 200 responses. Restored System and checked it after reload. |
| Export | UI downloaded parseable JSON containing three items, including both disposable items and their notes/tags. |
| External links | Open original launched the expected disposable example.com URL in another tab; open-record request returned 200. |
| Rediscover | Loaded the empty state for this recent local library. Nonempty recommendations were not exercised in the browser; existing D1 tests cover eligibility. |
| Offline/reconnect | Browser offline mode produced a load error with Try again; reconnect and retry restored search results. |
| Session expiry | Intercepted one list request with a simulated 401. Private rows disappeared and the sign-in-again state appeared. Removed interception and reloaded successfully. This does not verify real token expiry. |

Screenshots of short/long sheets and the short-height confirmation were visually inspected.
No uncaught JavaScript errors were recorded. Expected console errors came from deliberately
failed metadata, duplicate saves, offline requests and the simulated 401.

Chromium also warned that the existing manifest share target omits `enctype` and defaults to
`application/x-www-form-urlencoded`. Left unchanged in this testing/readability task; actual
Android sharing was not tested. A few browser-script attempts needed selector/API corrections;
the observations above come from successful checks, not those harness errors.

## Automated verification

- `npm run typecheck`: passed.
- `npm test`: all 32 tests passed, none skipped.
- `npm run build`: passed. This was the standard local-config build, not a deployment.
- `git diff --check` and `git diff --cached --check`: passed.
- No lint script is configured.

## Cleanup and boundaries

Both disposable items were deleted, one through the UI and the other through the local API.
The local library returned to its original one item, with its original ID retained. Settings
matched their starting values. No delete-all operation was submitted. Local screenshots and
the temporary export remain outside the repository. The loopback development server was left
running for owner review.

No production data, deployment, dependencies or application source were changed in this run.
Real GitHub sign-in/logout, other-identity rejection, Cloudflare session/connector refresh,
physical Android installation/sharing/keyboard behavior and native orientation changes remain
untested here. The dev browser had zero registered service workers, so offline fallback and
private-cache isolation were not browser-verified; existing automated service-worker tests passed.
