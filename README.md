# Later

A private, single-owner internet library. Save a URL with a note, organize it when convenient, and rediscover older unfinished links.

Built with React, TypeScript, Vite, Cloudflare Workers, D1, and Cloudflare Access with GitHub. Deploy on your own HTTPS subdomain using one local configuration file.

## Run locally

Use Node 22.13 or newer.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

Open the development server at port 4173 on localhost. The explicit `LOCAL_DEV=true` flag is accepted only by a development build on loopback. The production build removes that authorization path.

To add the optional design examples to the local database:

```bash
npm run db:seed
```

The seed command always uses local D1. The examples are review fixtures with real public URLs, not an imported personal library.

## Included

- Inbox, Library, Finished, Rediscover, Search, Settings, login, and the item detail drawer.
- URL capture, optional notes, duplicate detection, independent metadata enrichment and retry.
- Editable title, note and tags; lifecycle actions; accessible confirmations; JSON export.
- Search across titles, sources, notes and tags, tag filters and paginated results.
- Six reading palettes: Light, Sepia, Mint, Dark, Midnight and Cocoa, plus device appearance.
- A consistent Modernist editorial grid, Inter typography, thin rules, square controls, and restrained motion.
- Responsive phone navigation, full-width small-screen drawers, touch targets and safe-area spacing.
- Android PWA manifest, standalone launch, regular and maskable app icons, an optional native install prompt and an offline fallback page.
- Android share-menu target: share a link to Later, authenticate as the owner, review the URL and optional note, then Save.

Saving does not wait for metadata. A blocked or unavailable external website leaves the saved URL and note intact. Suggested tags use a small deterministic keyword list; there is no AI service.

## Share to Later on Android

Install Later through Chrome, then use another app's Share action and choose Later. The protected `/app/share` page prefills a URL and available title/text; it never saves automatically. Your GitHub owner session is required. An expired session requires sign-in before saving. Duplicate links show a link to the existing item without overwriting its note.

An older installation may need time to update its manifest. If Later is missing from the share sheet, reopen it online; if necessary, uninstall the installed app/shortcut and install again through Chrome. Your saved library remains in D1, but reinstalling can require sign-in again. A bookmark-only home-screen shortcut is not enough for OS share-target registration. See [share verification](docs/SHARING.md).

## Verify

```bash
npm run build
npm test
```

The tests use actual local D1 and the compiled Worker, plus isolated service-worker checks. They cover authentication, owner restrictions, origin validation, duplicate races, lifecycle actions, literal search, pagination, metadata parsing and preservation of manual edits, data export/deletion, and PWA cache privacy.

For local responsive review, open `/__review` while the development server is running. Its iframe uses real CSS viewport widths. This review interface is excluded from the production bundle. It is a Chromium layout check, not a replacement for testing an installed app on a physical phone.

## Deploy

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). A real Cloudflare account, D1 database, Access application and GitHub identity provider are required. No production credentials or database data are included.

Using your own accounts? The guide covers Zero Trust team setup, GitHub OAuth registration, the exact-owner policy, and where to find every deployment config value. The optional ChatGPT connector has a [separate setup guide](docs/CONNECTOR.md#setup).

Set `appOrigin` in `deployment.config.json` to your exact HTTPS origin, such as `https://later.example.com`. The script derives the Custom Domain and Worker origin from it. No source edits are required. Optional `ownerName`, `ownerHandle` and `ownerUrl` preserve your preferred display identity and site link; they do not authorize access.

The tracked config defaults/examples intentionally show the original owner's domain, email and display values. Replace those as well as the account/Access placeholders before deploying your own instance. Application code does not depend on those reference values.

```bash
cp deployment.config.json.example deployment.config.json
# Fill in your origin, account, database and Access application values.
npm run deploy -- --prepare-only
npm run deploy -- --validate-only
```

Preparation writes the production configuration without remote changes. Validation also builds and tests it without logging in, migrating or deploying. After authentication and Access setup, `npm run deploy` builds, tests, applies D1 migrations, and deploys the compiled Worker and assets. See the [portability audit](docs/OPEN-SOURCE-AUDIT.md) for publication checks and Git-history limits.

## Project map

| Location | Purpose |
| --- | --- |
| `src/` | React interface and browser API adapter |
| `shared/` | API types, settings and theme definitions |
| `worker/` | Authentication, validation, metadata and D1 APIs |
| `migrations/` | D1 schema |
| `public/` | Public login assets, manifest, icons and offline fallback |
| `tests/` | D1, Worker, security and PWA checks |
| `scripts/` | Local seed, icon rendering and deployment |
| `docs/` | Deployment instructions and verification limits |

The favicon uses an outlined Inter “L” so its appearance does not depend on an operating-system font. `node scripts/generate-icons.mjs` renders the committed vector to the required PNG sizes.

## Privacy boundaries

Cloudflare Access and the Worker both protect the private application. Private API responses and application documents are not stored in the service-worker cache. Only the generic offline page is cached. Opening and editing the library requires a connection and a valid session.

External metadata requests are bounded, redirects and DNS answers are checked, and non-public addresses are rejected. DNS checking and fetching are separate operations; the code does not guarantee DNS pinning. Optional remote thumbnails are loaded with no referrer. Turning off automatic metadata avoids new metadata fetches.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the current evidence and the checks still needed after deployment.

The private ChatGPT MCP connector provides search, read, save, edit and reversible lifecycle tools, plus one-call capture with tags/status, atomic note appending and additive tags. It uses separate owner-only authentication and exposes no permanent deletion. See [docs/CONNECTOR.md](docs/CONNECTOR.md) for request-ID retry semantics, configuration and verification status. It stays disabled until a separate MCP Access audience is configured.

## License

Copyright (C) 2026 Vinay Kumar Rasala (Xplo8E).

Licensed under the GNU Affero General Public License v3.0 or later.
See [LICENSE](LICENSE).