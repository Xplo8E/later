# Later implementation record

Design source: https://www.figma.com/design/qCOHnEWIqgCWaxvb37RDTz/Later.xplo8e.com?node-id=0-1

Reviewed on 22 September 2026 through the vinayrasala Figma connection.

## Scope

Single-owner private reading library. React, TypeScript, Vite, Cloudflare Workers, D1, and Cloudflare Access with GitHub. Production hostname: later.xplo8e.com. No public library, registration, AI, collaboration, or analytics.

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

- Added a shared, bounded API transport with no-store requests, explicit Access-redirect handling and session-expiry events. Authentication denial clears private UI state; connectivity errors remain distinct.
- Guarded pagination against stale responses and isolated detail-editor state between items. Close stays reachable while a mutation is pending.
- Hardened deployment checks for the intended account/database, owner, audience, disabled alternate URLs and removal of local authorization.
- Added transport and rediscovery coverage. The production build and all 18 tests pass.
- Added `scripts/smoke-local.mjs` for disposable local API and real-site metadata checks. It refuses non-local sessions and removes only the items it creates.
- Configured Cloudflare Access, GitHub and D1, and deployed the Worker. See [DEPLOYMENT-RUN.md](DEPLOYMENT-RUN.md) for evidence and unverified flows.
- Set Git origin to `https://github.com/Xplo8E/later.git`. No commit or push was performed; the owner will push.

## External configuration used by deployment

- Cloudflare account with the xplo8e.com zone.
- D1 database ID.
- Cloudflare Access team domain, application audience, and exact owner email.
- GitHub OAuth identity provider in Access.
- Git origin: `https://github.com/Xplo8E/later.git`.

These values have been configured for the first deployment. OAuth credentials remain in Cloudflare, outside the source tree.
