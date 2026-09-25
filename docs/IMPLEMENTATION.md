# Later implementation record

Initial private design reference reviewed on 22 September 2026. The design-file link and connected account identity are omitted from this public record.

## Scope

Single-owner private reading library. React, TypeScript, Vite, Cloudflare Workers, D1, and Cloudflare Access with GitHub. The production hostname is selected through `appOrigin`. No public library, registration, AI, collaboration, or analytics.

## Design decisions

- Use the supplied Inter typography, thin borders, minimal rounding, 204px sidebar, and row-based lists, preserving the Modernist technical editorial and International Typographic Style direction.
- Preserve the Login, Inbox, Item Detail, Rediscover, Library, Search, and Settings designs in both themes.
- Add Finished using existing row patterns. Add capture, loading, duplicate, error, empty, and destructive confirmation states.
- The Inbox rail contains only Rediscover. Hide it below 1280px, retaining the dedicated route.
- Library organization uses tags. Archive remains accessible through a Library filter.
- Escape, outside click, and a close button dismiss the detail drawer. Keep keyboard focus usable.
- Use honest data counts and real source links. Design examples are optional local fixtures, never inserted into production.
- Extend the original light/dark choices with distinct Sepia, Mint, Midnight and Cocoa reading palettes, while keeping one consistent typographic and layout system.
- Use a compact hamburger on phones, comfortable tap areas, narrow-width text wrapping and scrollable short-height dialogs.
- Include an Android-friendly web app manifest, maskable icons, optional native install prompt and a generic offline fallback without caching private library content.

The local implementation and browser interaction review are complete. Build, tests, screen coverage, corrected issues and remaining production/device checks are recorded in [VERIFICATION.md](VERIFICATION.md).

## Build sequence

1. Scaffold the requested stack and implement the Figma interface with local fixtures.
2. Compare the running app against reference screens and check narrower layouts.
3. Add D1 migrations, validated APIs, and the real frontend data adapter.
4. Save immediately, deduplicate at the database boundary, and enrich metadata independently.
5. Implement lifecycle actions, note/tag editing, search, rediscovery, export, and settings.
6. Validate Cloudflare Access JWTs in the Worker, restrict the owner, enforce same-origin mutations, and rate-limit writes.
7. Run build/type checks and meaningful API/security tests. Check the browser workflows and both themes.
8. Prepare the Cloudflare account configuration and deploy when authenticated account access is available.

## Authentication boundary

The public root shows only the login page. Protect /app, /app/*, /api, and /api/* in one Cloudflare Access application. The Worker validates the JWT signature, issuer, audience, expiry, and allowed owner identity. Disable workers.dev and preview URLs in production. Missing authentication configuration must fail closed.

Local development authentication is permitted only in the development build with an explicit local flag. A production build must eliminate that path. Local fixtures and local authorization do not demonstrate a production GitHub sign-in.

## September 23 continuation

Android sharing is implemented as a protected, non-mutating GET draft route with explicit authenticated Save. The existing capture form, duplicate handling and API are reused. See [SHARING.md](SHARING.md) for the flow, privacy boundaries and verification.

- Added a shared, bounded API transport with no-store requests, explicit Access-redirect handling and session-expiry events. Authentication denial clears private UI state; connectivity errors remain distinct.
- Guarded pagination against stale responses and isolated detail-editor state between items. Close stays reachable while a mutation is pending.
- Hardened deployment checks for the intended account/database, owner, audience, disabled alternate URLs and removal of local authorization.
- Added transport and rediscovery coverage. The production build and all 18 tests pass.
- Added `scripts/smoke-local.mjs` for disposable local API and real-site metadata checks. It refuses non-local sessions and removes only the items it creates.
- Configured Cloudflare Access, GitHub and D1, and deployed the Worker. See [DEPLOYMENT-RUN.md](DEPLOYMENT-RUN.md) for evidence and unverified flows.
- Initialized Git for the original installation. Repository hosting is independent of runtime configuration.

## External configuration used by deployment

- Cloudflare account containing the intended domain zone.
- D1 database ID.
- Cloudflare Access team domain, application audience, and exact owner email.
- GitHub OAuth identity provider in Access.
- Optional Git remote chosen by the repository owner.

These values have been configured for the first deployment. OAuth credentials remain in Cloudflare, outside the source tree.

## ChatGPT connector, 2026-09-23

`worker/mcp.ts` adds a stateless MCP endpoint with eight bounded library tools. `worker/library.ts` shares basic capture semantics with the browser API. `worker/library-mutations.ts` implements one-call upsert, atomic note appending and additive tags. Migration `0002_library_operations.sql` stores durable idempotency receipts; each receipt and its edits share a D1 transaction. Duplicate upserts preserve existing items unless merging is explicitly requested, and merging never changes existing title or status. No new dependencies or frontend changes are needed for these tools.

MCP verifies a separate owner-only Access audience; browser authentication and mutation Origin checks are unchanged. No deletion or settings tool is exposed. Deployment accepts an optional, distinct `mcpAccessAudience` and checks the compiled value. See [CONNECTOR.md](CONNECTOR.md) for tool contracts, dependency choices and verification limits.
