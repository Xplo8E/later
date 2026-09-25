# Verification record

## Current verification status

As of 25 September 2026, the latest automated verification was performed on `31217f5`,
including the portability and shared origin-validator changes now merged into `master`:

- `npm run typecheck`: passed.
- Production build: passed through `npm run deploy -- --validate-only`, which runs `npm run build`.
- `npm test`: 38 tests passed, none failed or skipped.
- `npm run deploy -- --validate-only`: passed, including compiled production-config checks.
- No lint script is configured.
- Production deployment was not performed for these portability/origin-validation changes.

Later changes to `master` added licensing and README text; application code and tests are
unchanged from that verified revision. This documentation cleanup did not rerun the tests.

The [25 September local UI checks](LOCAL-UI-VERIFICATION.md) cover browser interactions
and narrow/short viewports. They are not physical-device or real authentication tests.
Production sign-in, another-identity rejection, OAuth refresh, and physical Android
acceptance remain separate checks for the current revision. The owner's earlier report
of successful Android home-screen installation does not establish those results.

## Historical verification

The counts below belong to the releases reviewed on those dates, not the current test suite.

### 23 September 2026: MCP release and deployment

The connector release in [CONNECTOR.md](CONNECTOR.md) passed the production build and
32 tests, applied migration `0002_library_operations.sql`, and was deployed. Live OAuth
discovery, anonymous denial and the disabled workers.dev address were checked. After
refreshing the installed connector, ChatGPT's authenticated settings page visibly listed
all eight tools, including one-call upsert, atomic note append and additive tags. At that
check, new-tool calls from a conversation, production token lifecycle and a second real
identity remained unverified. Earlier deployment and consent evidence is in the connector
guide and [deployment run](DEPLOYMENT-RUN.md).

### 23 September 2026: Android share target

The share-target change passed 21 tests and the production build. Its evidence and phone
acceptance steps are in [SHARING.md](SHARING.md). The owner reported successful Android
home-screen installation; the new share flow had not been verified on the physical phone.

### 22 September 2026: Initial UI review

The following sections preserve the original local review and its acceptance limits.
References under `qa/` identify local artifacts from that review, not files shipped in Git.

#### Build and automated checks

- `npm run build`: passes TypeScript and the client/Worker production builds.
- `npm test`: 15 tests pass, with no failures or skipped tests.
- Tests exercise actual local D1 and the compiled Worker. Network responses in the full metadata test are controlled fixtures.
- Coverage includes duplicate races, lifecycle timestamps, title/note/tag editing, literal search, pagination, export, confirmed delete-all, rate limits, JWT verification and owner restrictions, same-origin writes, metadata bounds and preservation of manual edits.
- The production Worker rejects local development authorization and returns `X-Frame-Options: DENY`. The development-only responsive review interface is absent from the production bundle.
- PWA checks cover manifest fields, PNG sizes, maskable icons and the service worker's limited cache behavior.

#### Design and readability

The approved Modernist technical editorial direction is retained: Inter throughout, clear typographic hierarchy, an aligned grid, thin rules, flat surfaces and nearly square controls. Palettes change the reading atmosphere without changing the interface structure or introducing decorative typefaces.

Titles use 16px medium-weight text in lists. Notes use 14px regular text with a 1.55 line height; detail notes use 15px and 1.65. Metadata is 13px. Phone text fields are 16px. Phone notes wrap to two lines instead of becoming a short single-line fragment. The full note remains available in the detail drawer.

The menu uses a 22px three-line icon inside a 44px tap area. Row actions, drawer actions, text actions and primary buttons have 44px minimum phone tap heights. Tag filters use 36px heights with spacing between them. Focus outlines remain visible. Reduced-motion preferences are respected.

##### Measured palette contrast

Ratios below use the CSS color values, not antialiased screenshot pixels. “Secondary” is the muted metadata token. Full measurements are in `qa/contrast.json`.

| Theme | Main text / background | Secondary / surface | Notes / surface | Control border / surface | Primary button label |
| --- | ---: | ---: | ---: | ---: | ---: |
| Light | 14.35 | 5.10 | 6.48 | 3.14 | 17.46 |
| Sepia | 10.98 | 4.75 | 6.36 | 3.78 | 8.26 |
| Mint | 10.15 | 4.81 | 6.14 | 3.30 | 7.12 |
| Dark | 15.50 | 8.47 | 10.96 | 3.46 | 11.90 |
| Midnight | 14.13 | 8.18 | 10.21 | 4.56 | 10.10 |
| Cocoa | 13.08 | 7.79 | 9.42 | 4.31 | 9.05 |

These core text pairs exceed 4.5:1; measured interactive borders exceed 3:1. This is not a claim of complete WCAG conformance. Physical display brightness, individual comfort, ambient daylight and night-time glare have not been measured. The dark palettes avoid bright white navigation blocks and bright notification flashes.

All six palette buttons and System were clicked in the phone interface. Selection state and persistence were checked. The final local preference is Midnight; default capture is Inbox with metadata and tag suggestions enabled.

#### Responsive review

The review used Chromium and a same-origin development iframe with real CSS viewport sizes. It is not an Android device emulator.

| Screen | Evidence |
| --- | --- |
| Inbox | Width measurements at 280, 320, 360, 390, 430, 540, 699, 700, 701, 768, 1023, 1024, 1279 and 1280px, with no horizontal document overflow in that sweep |
| Settings | Width measurements at 280, 320, 360, 390, 430, 540, 700, 701, 768, 1023, 1024 and 1279px, with no horizontal document overflow in that sweep |
| Library, Rediscover, Search | Visual inspection at 280px; interactive review at 320px |
| Finished | Visual and interaction review at 320px |
| Login | Visual inspection at 280px, including the complete sign-in button |
| Detail drawer | Compact mobile sheet at 390 × 740px; long-note scrolling at 320 × 420px; menu and editor at 280 × 320px; see the follow-up below |
| Confirmations and row menus | Checked at 320 × 320px; content scrolls within the viewport and controls remain reachable |
| Desktop | Inbox, detail and Settings inspected at the normal desktop viewport |

Scrollbar width can reduce the available content width by 15px in this environment. Narrow rows prioritize text, and list images are hidden below 360px. Detail previews are hidden on mobile so they do not displace the note. The mobile header, drawers and notifications account for safe-area insets.

##### Mobile note detail follow-up

The user's concern was confirmed: the earlier drawer was responsive in width but unnecessarily tall. At 390 × 740px, a two-line note almost filled the screen, with edit controls below the fold. The 150px placeholder preview and generous metadata spacing were the main causes. Evidence: `qa/11-note-before.jpg`.

| Step | Result after correction |
| --- | --- |
| 1. Open a note | Healthy in the reviewed phone layout. The same short note fits in a bottom sheet approximately 400px tall, with title, source, note, tags, dates and both actions visible. |
| 2. Read longer content | Healthy in the reviewed reduced viewport. At 320 × 420px, the content body scrolls to the final paragraph and tags while Close, Open original and Actions stay visible. |
| 3. Edit and manage | Healthy in the reviewed flow. Actions opens a menu; Edit note focuses the editor; the footer Save persists changes; Edit tags and Cancel work; Delete link opens the existing confirmation and Cancel preserves the note. At 280 × 320px, the editor and Save/Cancel remain reachable and a tall menu scrolls within its available space. |

Mobile uses a content-sized sheet, hides the preview, condenses metadata, and moves secondary controls into Actions. Editing replaces the reading sections with the editor. The Inter typography, flat surfaces, rules and existing palettes remain. Desktop retains its side drawer and visible action list.

The temporary long note used for this check was restored to its original text through the UI. `npm run build` and all 15 existing tests passed after these changes. This is browser viewport evidence, not a physical phone or software-keyboard test; long notes and exceptionally short screens still need content scrolling.

Evidence: `qa/13-note-actions.jpg`, `qa/14-long-note-320.jpg`, `qa/15-note-editor-280.jpg`, `qa/16-desktop-detail.jpg`, and `qa/17-mobile-note-final.jpg`.

##### Interaction pass

| Area | Checked behavior |
| --- | --- |
| Navigation | Hamburger open/close, Escape, focus return, every section, account shortcut, logo/home, repeated home navigation |
| Capture | Invalid URL error, expanded form, optional note, cancel, save to the configured destination, duplicate warning and opening the existing item |
| Detail | Open/close, title validation, title/note/tag saves, multiline notes, editing with reduced vertical space |
| Item organization | Move to Library, move to Inbox, mark Finished, archive, find archived item, restore it, updated counts |
| Row menus | Open menu, keyboard access to offscreen entries, edit entry and destructive confirmation |
| Search | Tag plus note search, clear search, no-results state, results after Rediscover, result details |
| Rediscover | Featured item, smaller cards, detail views and reshuffle |
| External opening | Original URL opens separately and the item's open count updates |
| Settings | All appearance choices, default saved location, both switches, export trigger and local sign-out |
| Deletion | Cancel from a row confirmation, detail confirmation, successful deletion of only the temporary review item |
| Delete all | Typed confirmation stays disabled until the exact phrase; cancel/reopen resets the phrase. Actual bulk deletion is tested only in isolated D1 tests |

The temporary item used for the lifecycle checks was removed. Pagination is covered by the D1 tests; the “Show more” interface was not exercised with a large browser fixture set. Native install prompts and production sign-in are outside the local interaction evidence.

##### Issues corrected during review

- Replaced the oversized text menu with a compact hamburger.
- Increased dark metadata contrast, refined weights and spacing, and separated the six palettes more clearly.
- Corrected narrow-screen input, account, row, filter and action layouts.
- Made short-height confirmations and dropdown menus scroll instead of clipping their controls.
- Corrected mobile CSS that was narrowing large detail thumbnails.
- Focused the note/tag editor when opened directly from a row menu, and blocked conflicting edits while a save is pending.
- Fixed Search loading after routes with the same status filter and repeated home navigation leaving an empty loading view.
- Kept Rediscover suggestions stable during unrelated metadata refreshes.

#### PWA and deployment limits

The manifest supports standalone launch, regular and maskable icons, an app name, start URL and shortcuts. Settings uses Chrome's native install event when it is available, with a manual Chrome-menu instruction otherwise. The service worker caches only a generic offline page; it does not cache private pages, API responses or authentication responses.

Acceptance checks recorded at the time, before the later deployment:

1. Publish behind Cloudflare Access with the configured GitHub identity provider and exact owner policy.
2. Verify owner sign-in, rejection of another identity, signed-out API behavior and live D1 persistence.
3. Validate metadata against ordinary public sites on the deployed Worker. A local retry for the D1 documentation remained unavailable; the URL and note stayed intact. Controlled Worker tests verify parsing and enrichment, but do not prove every external site is reachable within the seven-second limit.
4. Install from Android Chrome on the live HTTPS origin and check standalone launch, keyboard behavior, rotation, external links and reconnect/offline behavior on the phone.
5. Check Safari/iOS separately if it will be used. No physical Android, Safari, screen-reader or exhaustive browser/viewport certification is claimed.

Metadata DNS validation and the subsequent fetch are separate operations. The implementation does not guarantee DNS pinning. See [DEPLOYMENT.md](DEPLOYMENT.md) for the live acceptance steps.

Reference criteria: [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), and [PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
