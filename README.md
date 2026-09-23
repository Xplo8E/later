# Later

A private, single-owner internet library for Vinay. Save a URL with a note, organize it when convenient, and rediscover older unfinished links.

Built with React, TypeScript, Vite, Cloudflare Workers, D1, and Cloudflare Access with GitHub. The production target is `https://later.xplo8e.com`.

## Run locally

Use Node 22.13 or newer.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

Open the development server at port 4173. The explicit `LOCAL_DEV=true` flag is accepted only by a development build on loopback or the supported local preview host. The production build removes that authorization path.

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

Saving does not wait for metadata. A blocked or unavailable external website leaves the saved URL and note intact. Suggested tags use a small deterministic keyword list; there is no AI service.

## Verify

```bash
npm run build
npm test
```

The tests use actual local D1 and the compiled Worker, plus isolated service-worker checks. They cover authentication, owner restrictions, origin validation, duplicate races, lifecycle actions, literal search, pagination, metadata parsing and preservation of manual edits, data export/deletion, and PWA cache privacy.

For local responsive review, open `/__review` while the development server is running. Its iframe uses real CSS viewport widths. This review interface is excluded from the production bundle. It is a Chromium layout check, not a replacement for testing an installed app on a physical phone.

## Deploy

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). A real Cloudflare account, D1 database, Access application and GitHub identity provider are required. No production credentials or database data are included.

```bash
cp deployment.config.json.example deployment.config.json
# Fill in the real account, database and Access application values.
npm run deploy -- --prepare-only
```

The preparation command writes the production configuration without making remote changes. After authentication and Access setup, `npm run deploy` builds, tests, applies D1 migrations, and deploys the compiled Worker and assets.

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
