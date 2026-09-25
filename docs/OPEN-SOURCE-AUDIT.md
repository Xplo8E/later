# Deployment portability audit

Baseline: `b435e53`, reviewed 2026-09-25. This inventory precedes the portability edits;
line references below refer to that baseline. Values which identify the original account
are intentionally not repeated here. This is a deployment/configuration audit, not a claim
that every security property or third-party dependency has been audited.

## Runtime coupling

| Location | Value / role | Decision |
| --- | --- | --- |
| `scripts/deploy.mjs:58,66` | Original personal hostname in Custom Domain route and `APP_ORIGIN` | Require one `appOrigin`; derive route hostname and Worker origin from it. |
| `wrangler.jsonc:20-22` | Original production origin, owner name and GitHub handle | Owner requested these remain as editable reference config values. Production overrides come from deployment config; source code stays independent. |
| `src/App.tsx:630,674-675` | Personal-site links, account handle fallback and fixed avatar initial | Optional `ownerUrl` for both links; derive label from URL and avatar from session display identity. No personal fallback. |
| `worker/metadata.ts:14` | Original hostname blocked to prevent previewing the app itself | Derive blocked hostname from `APP_ORIGIN`; apply to initial URLs, redirects and image URLs on preview/capture/retry/MCP paths. |
| `worker/auth.ts:7-46` | Access issuer/audience/email, display values, same-origin checks | Already env-driven. Retain exact-owner/signature checks; explicitly validate missing/malformed application origin. Display fields never grant access. |
| `worker/mcp.ts:92-95` | Separate MCP audience and Origin restriction | Already env-driven. Keep missing/reused MCP audience disabled and require the configured origin. |
| `vite.config.ts:7`, `worker/auth.ts:28` | `terminal.local` preview host | Remove environment-specific preview alias; retain explicit development bypass only on loopback. |
| `scripts/deploy.mjs`, compiled-Worker tests | Worker name/output path `later` | Harmless application default, not account identity. Document the fixed Worker name and check name collisions before deployment. |

## Tests, examples and documentation

| Location | Finding | Decision |
| --- | --- | --- |
| `tests/api.test.ts:15`, `security.test.ts:11,30,36,41`, `worker.test.ts:10`, `mcp.test.ts:10,112-113`, `share.test.ts:32-33`, `pwa.test.ts:36,54` | Personal hostname used as a synthetic origin | Replace with reserved example origins. These tests use local Workers/mocks, not production. |
| `README.md:3,5,65`, `docs/DEPLOYMENT.md:5,13-15,119` | Personal description and instructions requiring source edits for a custom domain | Replace with configuration-only setup instructions. |
| `docs/DEPLOYMENT-RUN.md:5-17,36,48` | Personal hostname/repo path/Git remote/email; account, D1, Access app, Worker version IDs; Access team and workers.dev URL; historical DNS addresses | Sanitize the historical record without presenting old evidence as a new deployment. Identifiers are not passwords but do not belong in reusable setup examples. |
| `docs/IMPLEMENTATION.md:3-9,53-63` | Private design-file link, connected Figma identity, personal domain/repository/account context | Remove private design/account references; describe generic requirements. |
| `docs/CONNECTOR.md:3-5,84-104` | Personal endpoint and historical deployment/application identifiers | Derive endpoint from `appOrigin`; sanitize historical identifiers while retaining verification limits. |
| `docs/SHARING.md:27`, `docs/VERIFICATION.md:5` | Historical personal deployment URL/version | Sanitize; keep historical dates and tested/untested distinctions. |
| `deployment.config.json.example`, `.dev.vars.example` | Account placeholders, reference owner values and explicit local-only auth flag | Keep account/Access placeholders; retain original domain/email/display values by owner request. Forks must replace reference values. Secrets stay outside Git. |
| Environment setup guidance | No `.env` file is required | Keep guidance in `docs/DEPLOYMENT.md`; use the existing production config and local `.dev.vars`, without duplicate environment knobs. |

## Already portable / harmless constants

- Browser API paths (`src/lib/api.ts`), login/logout and share return paths, manifest URLs,
  service-worker scope/cache paths and viewport-review iframe sources are same-origin paths.
- `worker/http.ts` CSP uses `'self'` plus generic HTTPS/data image schemes. No personal CSP
  host, cookie domain or cross-origin allowlist was found. Cookies and OAuth grants are managed
  externally by Cloudflare Access; the source does not set a deployment-specific cookie domain.
- `index.html` has generic metadata, no canonical/OpenGraph deployment URLs. SVG namespace
  URLs and application/icon/cache names are not deployment settings.
- `worker/metadata.ts` uses Cloudflare's public DNS-over-HTTPS endpoint, standard web ports,
  public-address checks and a generic User-Agent. These are service/protocol constants,
  not the owner's infrastructure. No new resolver configuration is needed.
- `src/lib/fixtures.ts` and `scripts/smoke-local.mjs` use public reference sites and reserved
  failure URLs; fixtures are explicitly local-only. Topic/tag heuristics reflect the initial
  reading use case but do not depend on an account or domain.
- Test owner emails, generated signing keys, fake audiences and example URLs are synthetic.
  Package-lock registry/funding/repository URLs are dependency metadata, not deployment targets.
- GitHub's callback is derived from the configured Access team domain plus
  `/cdn-cgi/access/callback`. ChatGPT callbacks in the connector guide are provider-owned
  endpoints, not personal values. Configure them in Access/GitHub, not in the application.

## Sensitive-value review and verification

### Resulting configuration

`deployment.config.json` is the only production configuration input. Required fields:
`appOrigin`, `accountId`, `databaseId`, `databaseName`, `accessTeamDomain`, `accessAudience`
and `ownerEmail`. Optional fields: `mcpAccessAudience`, `ownerName`, `ownerHandle`, `ownerUrl`.

- `appOrigin` supplies the exact Worker origin and its Custom Domain hostname. API/share/login/
  logout/manifest URLs remain relative. Metadata excludes this installation on every fetch path.
- Access issuer/JWKS and the documented GitHub callback derive from `accessTeamDomain`.
- Display names/handles are not trusted identities. `ownerUrl` is optional because a personal
  homepage cannot safely be inferred from a subdomain; its label derives from the URL hostname.
- The Worker puts only that optional public URL into an escaped HTML attribute. The frontend
  validates its HTTPS scheme before rendering. No account IDs, owner email, audiences or secrets
  are injected into public HTML or the browser bundle.
- Missing/invalid production config fails before subprocesses run. The Worker rejects private
  requests with missing/malformed origin or Access settings; it does not trust the request Host
  as an authorization default. The public root remains public.
- `--prepare-only` generates config; `--validate-only` also builds, verifies compiled bindings
  and runs tests, but performs no login check, remote migration or deployment.

The existing ignored local deployment config was extended with its original origin and display
values; account/database/Access settings were preserved. Generated production config remains
ignored. The old local-preview alias was deliberately removed; the explicit development bypass
now accepts only loopback hosts. No dependencies, DNS, Access policies or live accounts changed.

### Checks performed

- `npm run typecheck`, `npm run build`, and all 37 tests passed.
- `npm run deploy -- --validate-only` passed using the existing installation's local config.
- Deployment tests exercise two unrelated reserved example origins, optional display/MCP values,
  missing/invalid settings and compiled-origin/route/identity drift without real subprocesses.
- Compiled-Worker tests cover default/configured/invalid public branding, non-disclosure of private
  bindings, missing origin, signed-out API/app denial, self-host preview/redirect/image rejection,
  self-host capture note preservation and retry acceptance. Existing identity, MCP, mutation,
  service-worker privacy and D1 tests still pass.
- Local Chromium login/settings check showed generic developer identity and the derived `L`
  avatar, no optional external link, and no uncaught JavaScript errors. This is local development
  with its explicit auth bypass, not production GitHub authentication.
- Diff whitespace checks passed. No lint script is configured.

### Sensitive-value scan

**Subsequent owner decision:** after the initial scan below, the owner explicitly requested
restoring original non-secret domain/email/display values in tracked configuration. Those now
appear in `wrangler.jsonc`, `deployment.config.json.example` and `.dev.vars.example` by design.
Cloudflare account/database IDs and Access audiences remain placeholders in the template.
No personal literals were restored in application source or tests. The initial clean scan is
historical evidence, not a claim that the current tracked config contains no personal values.

Scanned all 69 tracked working-tree paths plus the five new files in this change using redacted
pattern checks for personal references, account-style identifiers, private keys, GitHub tokens,
JWTs and literal credential assignments. The only text candidate after cleanup was the clearly
synthetic D1 UUID in `tests/deployment.test.ts`. No candidate secret was found. The four PNG files
were excluded from text regex checks; their PNG chunks were inspected separately and contained
only IHDR/IDAT/IEND, with no text/EXIF metadata. Dependency integrity hashes and public registry
links are not deployment credentials. No dedicated secret-scanner executable was available, so this is a
heuristic scan plus source review, not proof that no possible secret exists.

Also scanned 116 historical text blobs reachable from local Git refs: no credential-pattern
candidates, but 37 blobs retain personal references. Git history contains two distinct author
identity entries. Sanitizing the working tree does not erase any of that history. The ignored
local deployment config, generated config and `.dev.vars` are not tracked; keep them that way.

### Before publication

- Decide whether existing personal references and author metadata may remain in Git history.
  If not, use a separately approved history cleanup or clean-history publication. No history
  rewrite was performed, and local scans cannot attest to remote-only refs or copies.
- Choose a license before describing the project as open source; no license is currently tracked.
  No license terms were selected on the owner's behalf.
- Commit/review the intended sanitized files before publishing. Do not add local config or build
  output. No commit, push or deployment was performed in this audit.
- Live deployment, real GitHub login/other-identity denial, OAuth refresh and physical Android
  remain acceptance checks after deployment; local tests are not production evidence.

## PR #3 follow-up: Internationalized hostname validation

The review of `327a745` identified that the duplicated hostname regex rejected punycode
TLDs such as `xn--p1ai`. Regression tests reproduced that rejection before the fix.

- `applicationOrigin()` in `shared/site-config.ts` is now the single origin validator
  used by deployment and Worker authentication. It validates individual DNS labels,
  including punycode TLDs, and enforces the 63-character label and 253-character hostname
  limits. The latter also closes the previous missing total-hostname-length check.
- HTTPS, canonical ASCII/punycode spelling, multiple labels, and no IP literals,
  credentials, explicit ports, paths, queries or fragments remain required.
- The deploy command uses the existing `tsx` loader to import the shared TypeScript
  module, without adding dependencies or relying on native Node TypeScript support.
- Tests cover accepted punycode origins and generated routes, invalid hosts and
  noncanonical origins, length boundaries, and exact-origin authorization with IDNs.
- The focused deployment tests, typecheck, production build/config validation, all
  38 tests, and diff whitespace checks passed locally. No lint script is configured.

Branding defaults and PR structure are unchanged. No production deployment or live IDN
DNS/Cloudflare provisioning was performed; these checks establish local validation behavior.
