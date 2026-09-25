# Readability refactor

## Scope

Branch: `dev`. The owner reviewed the CaptureInput and DetailDrawer slices, then
approved continuing the same approach through the remaining hotspots.
Current pass: App state/rendering, remaining UI helpers, and dense Worker control flow.
No dependency, CSS, API contract, authentication policy, configuration or deployment changes.

## Hotspots inspected

| Module | Readability issue | Decision |
| --- | --- | --- |
| `src/App.tsx` | Dense navigation/state resets, effects, nested status expressions and async handlers | Refactored in current pass |
| `src/components/DetailDrawer.tsx` | Compressed editor initialization, save/move handlers, nested labels and action markup | Completed; owner approved approach |
| `src/components/CaptureInput.tsx` | Chained preview callbacks, compressed save/reset logic, inline draft updates and nested preview text | Completed; owner approved approach |

## Slice 1: CaptureInput

### Changes

- Expand preview success/failure callbacks and cleanup into readable blocks.
- Expand validation, save, error handling and reset without changing their order.
- Name URL/note edit handlers and preview/save display values.
- Expand capture markup without changing elements, classes, attributes or text.
- Add intent comments for mount-only drafts, preview cleanup/cancellation, independent saving,
  reset/focus ordering and the display-only destination prop, as requested during review.

### Behavior boundaries

- Keep effect dependencies `[url, expanded, fetchMetadata]` and the 650 ms debounce.
- Keep preview reset and error/duplicate clearing together on each effect run.
- Clear the timer and abort the request on cleanup; ignore aborted successes and failures.
- Keep the promise chain to preserve its scheduling and rejection handling.
- Keep `api.create(url.trim(), note.trim())`; `defaultStatus` remains display-only here.
- Reset and focus before calling `onSaved`, inside the same try/catch.
- Keep initial draft mount-only and notify `onDraftChange` only on user edits.
- Keep custom cancel taking precedence over local reset.
- Do not add save cancellation, duplicate clearing, memoization or a custom hook.

### Verification

Completed locally on 2026-09-25:

- Baseline: `npm run build` and `npm test` passed, 32 tests.
- Refactor: `npm run typecheck`, `npm run build` and `npm test` passed, 32 tests.
- `git diff --check` passed. Reviewed dependencies, abort guards, setter ordering,
  request arguments and markup against `HEAD`.
- A one-off React server-render comparison against `HEAD` matched exactly in 12
  initial-render cases: empty/invalid/valid draft URLs, both destination labels,
  and metadata enabled/disabled. This was not a browser interaction test.
- There is no lint script in `package.json`; no linter or dependency was added.

Existing tests do not directly exercise this component's React interactions.
Browser debounce, focus, cancellation races and mobile interactions were not tested
in this slice. No production or physical-device verification was performed.

## Slice 2: DetailDrawer

### Changes

- Name the props and editable-field types instead of embedding them in the signature.
- Expand editor initialization and save/move operations into explicit control flow.
- Name submit, dialog-open and menu-close focus handlers without merging their conditions.
- Replace nested editor/history labels with intermediate values.
- Expand markup while retaining the existing element hierarchy and action order.
- Explain ID-based initialization, failure handling and the mobile footer's form wiring.

### Behavior boundaries

- Keep `[link?.id, edit]` initialization dependencies. Same-ID background updates must
  not reinitialize the editor; keep the separate focus effect dependent on `[editing]`.
- Keep tag splitting, trimming and empty-entry removal, without new normalization.
- Keep patch construction inside the try block and close the editor only on success.
- Keep busy/error setter order and the distinct save/move error messages.
- Keep both focus conditions: dialog opening requires the parent's `edit` prop;
  menu closing requires only an existing textarea ref.
- Keep desktop/mobile controls, DOM wrappers, classes, disabled states and menu events.
- Keep mobile Save outside the scrolling body, targeting `form="detail-editor"`.
- Do not add cancellation or stale-response guards to save/move, change in-flight close
  behavior, or move hooks behind an early return. Those would be behavioral changes.

### Verification

Completed locally on 2026-09-25:

- `npm run typecheck`, `npm run build` and `npm test` passed, 32 tests.
- Working-tree and staged diff whitespace checks passed. No lint script is available.
- A one-off comparison against the unchanged drawer in `HEAD` matched 768 element-tree
  and effect-dependency cases (status, metadata status, open count, editor, busy and error).
- Another 28 comparisons matched initialization, save success/failure, move success/failure,
  edit selection and focus-handler call traces. The comparison used stubbed hooks, not a
  browser or a real React lifecycle. An initial harness assertion compared VM array
  prototypes; normalizing arrays into the host realm resolved that harness-only mismatch.
- Reviewed the diff for unchanged menu events, keys, action order, error text, form wiring,
  effect dependencies and callback boundaries. No additional edits to CaptureInput.

Radix focus timing, keyboard navigation, mobile scrolling and physical-device behavior
remain untested in this slice. No production verification or deployment was performed.

## Slice 3: Remaining hotspots

### Changes

- `src/App.tsx`: expanded state transitions, effect callbacks and cleanup; named handlers
  for edit/close/save/duplicate/retry operations; explicit list/empty/auth rendering branches;
  expanded navigation, settings and capture markup. Local render helpers are ordinary
  function calls, not new React component boundaries or custom hooks.
- `src/components/SavedItemRow.tsx`, `Rediscover.tsx`, `primitives.tsx`: named props,
  readable menu/card/confirmation markup, explicit thumbnail fallback and confirmation guards.
- `src/lib/useInstallPrompt.ts`, `format.ts`, `api.ts`, `transport.ts`, `src/main.tsx`:
  explicit event setup/cleanup, date grouping, request/error handling and service-worker startup.
- `worker/db.ts`, `api.ts`: expanded query-building and batch/export blocks, without SQL changes.
- `worker/metadata.ts`: expanded redirect/body cleanup, HTML callbacks, optional-image handling
  and kind selection; retained address/DNS checks and timeout boundaries.
- `worker/auth.ts`, `http.ts`, `validation.ts`, `mcp.ts`, `library-mutations.ts`:
  clarified dense configuration objects, cleanup, validation callbacks, tool input handling
  and operation hashing. No new shared abstractions or changed tool definitions.

### Deliberately preserved

- Hook ordering and dependencies, promise chaining, active/abort guards and timer durations.
- Navigation vs browser history behavior, share draft retention on session expiry, state-setter
  ordering, selected-item fallback and pagination generation checks.
- Row errors reported by `safePatch` vs rejected detail-editor patches, including async error
  boundaries and lack of new cancellation for mutations.
- DOM hierarchy, classes, keys, text, disabled conditions, menu selection and form wiring.
- All SQL text, bind ordering, transaction boundaries, JSON field ordering, URL normalization,
  request/response statuses, validation limits and auth/origin rules.
- No added retry logic, dependency upgrades, layout/design changes or changed hard-coded values.

### Reviewed and left alone

The share parser, straightforward Worker entrypoint/capture helpers, shared data definitions,
fixtures, local viewport lab, deployment scripts/configuration, migrations, static assets and
existing test formatting are outside the changes. Compact declarations or simple guards were
not expanded just to enforce a line-length rule.

### Verification

Completed locally on 2026-09-25, compared against `e73f3ea`:

- `npm run typecheck`, `npm run build` and `npm test`: passed, all 32 existing tests.
- `git diff --check` and `git diff --cached --check`: passed. No lint script is available.
- One-off frontend checks: 136 element-tree comparisons, 25 handler/effect traces and
  eight formatting comparisons matched the baseline. Cases cover auth/list rendering,
  navigation and session expiry, patch status updates, list success/failure/cancellation,
  stale pagination, cards, thumbnails, typed confirmations and install-event cleanup.
- Those frontend checks use stubbed hooks and browser globals. They do not verify React
  scheduling, Radix focus timing, browser layout or physical-device behavior. The helper
  stays in the local task workspace, outside the proposed repository changes.
- AST comparison across edited modules found all 37 `prepare()` SQL expressions and all
  22 effect/callback dependency lists unchanged and in the same source order.
- Reviewed async boundaries, state setter order, API arguments, transaction/bind ordering,
  DOM structure and literals. An intermediate misplaced render helper was caught by
  typecheck and corrected before the passing build and comparison run.

Browser interaction checks were subsequently performed locally on 2026-09-25; see
[Local UI verification](LOCAL-UI-VERIFICATION.md). Production and physical-device
verification remain unperformed for this refactor. No new runtime/test dependency or
test framework was introduced.

## Slice 4: Scripts

### Changes

- `scripts/deploy.mjs`: expanded configuration checks and generated settings; named the
  compiled-configuration mismatch condition and npm command; documented production guards.
- `scripts/smoke-local.mjs`: named request results and export lookup; expanded the URL list,
  patch body and cleanup loop; explained asynchronous metadata polling.
- `scripts/seed.ts`: replaced nested SQL-quoting ternaries with explicit branches; aligned
  columns and values; explained apostrophe escaping and temporary-file cleanup.
- `scripts/generate-icons.mjs`: named renderer/PNG steps and explained the maskable SVG inset.
- Added comments describing the deployment regex constraints and SVG wrapper removal.
  Patterns themselves are unchanged, including the intentionally basic email shape check.

### Deliberately preserved

- Hard-coded domain/origin, validation order and messages, config JSON output, prepare-only
  exit, command arguments/environment, build checks and migration/deployment order.
- Smoke-test origin, URLs, assertion order, 20-second request timeout, 50-second metadata
  deadline and one-second polling. Cleanup still stops if a deletion assertion fails;
  making cleanup best-effort would be a separate behavior change.
- Seed SQL text, value order, local-only Wrangler command, and cleanup on write/command failure.
- SVG source, replacement regexes, icon sizes, rendering options and output paths.

### Verification

Completed locally on 2026-09-25:

- `npm run typecheck`, `npm test` (32 passing tests), and `npm run build`: passed.
- `node --check` for all three `.mjs` scripts: passed. `scripts/seed.ts` also passed a
  separate strict TypeScript check because the project configs do not include that script.
- 61 baseline comparisons against `12a2063`: 51 deployment cases, three seed cases,
  one icon-output comparison and six smoke-test scenarios.
- Deployment comparisons covered validation failures, prepare-only, optional MCP audience,
  Windows command selection, subprocess failures and compiled-configuration mismatches.
- Seed SQL and command/cleanup traces matched, including write and command failures.
- The real SVG renderer produced identical SHA-256 hashes for all four PNG outputs.
- Smoke request bodies/order, polling, assertions and cleanup matched on success, nonlocal
  authentication, duplicate failure, fetch failure, metadata timeout and cleanup failure.
- An initial icon comparison hit a VM object-prototype mismatch in the harness. Normalizing
  event objects fixed the comparison; no application/script change was needed.
- Diff whitespace checks passed. No lint script is configured.

Script filesystem writes and subprocess calls were mocked for these comparisons. No actual
deployment, fixture seeding or live smoke run was performed in this slice. The comparison
harness lives in the local task workspace, not in the repository or runtime dependencies.

## Handoff

The first three source slices were committed as `12a2063` on `dev`, excluding Markdown files.
The four script changes and tracking documents remain uncommitted for owner review.
No push, deployment or PR creation.

## Follow-up: Metadata readability

Completed locally on 2026-09-25, on top of the pending portability changes.

- Expanded address, port, DNS, redirect and error guards in `worker/metadata.ts`.
- Named the DNS lookup callback, host/port conditions, entity-decoding values and
  HTML metadata intermediates. Expanded tag rules and database statement chains.
- Added comments for hostname/entity/tag regexes, DNS record types, stale-result
  protection, manual edits and metadata-only failure updates.
- Preserved validation order and short-circuiting, parallel A/AAAA lookups, the shared
  seven-second timeout, response cancellation, redirect limits, decoding/truncation
  order, optional-image failure handling, and SQL text/binding/batch order. The
  existing configuration-driven self-host exclusion remains intact.
- `npm run typecheck`, `npm run build`, and `npm test` passed: 37 tests, none skipped.
  Diff whitespace checks passed. No lint script is configured.

This follow-up changes only the metadata module and this tracker. No live requests,
production deployment, commit or push was performed.
