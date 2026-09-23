# Deployment run: 23 September 2026

## Published configuration

- URL: https://later.xplo8e.com
- Repository: `/Volumes/vinay-ssd/repos/later`, extracted from the supplied source archive and initialized as a Git repository.
- Origin: `https://github.com/Xplo8E/later.git`. Initial source committed as `40317ad` at the owner's request. No push performed by Codex.
- Cloudflare account: `e9214373e8991f269dddf47461c0d5f8`.
- Worker: `later`, version `f8bdf563-050b-4194-8a56-608d7dea34b4`, deployed at 2026-09-23 01:30 UTC.
- D1: `later`, ID `d1cd5095-ec95-4205-9f17-21d95f7017bd`, region APAC.
- Migration `0001_initial.sql` applied successfully to remote D1. No sample fixtures were inserted.
- Access team: `https://calm-butterfly-5cad.cloudflareaccess.com`.
- Access application: `Later private library`, ID `d99e5811-8331-4db1-9684-5fb58d11d223`.
- One Allow policy: include the exact email `rvkyadav71@gmail.com`, require GitHub. No Everyone, Bypass or Service Auth policy.
- Destinations: `later.xplo8e.com/app` and `later.xplo8e.com/api`, covering descendants. Root remains public.
- GitHub is the only accepted identity provider; instant authentication enabled; Cloudflare One Client authentication disabled. Application session duration: 24 hours. HttpOnly cookie enabled.
- `workers_dev` and `preview_urls` are false in the generated deployment configuration. The live Domains dashboard confirms both switches are off. `https://later.rvkyadav71.workers.dev/` returns HTTP 404.
- Zero Trust Free was selected by the owner. No paid upgrade was performed. The Workers account plan still needs a dashboard check.

The ignored `deployment.config.json` contains environment identifiers, not OAuth secrets. GitHub's client secret was entered into Cloudflare by the owner and is not in this repository.

## Verified in this run

1. Reproduced the original build and 15 tests before changes. After changes, TypeScript/client/Worker production builds and all 18 tests passed, including during `npm run deploy`.
2. The deployment script verified the account, compiled out local authorization, checked compiled bindings, ran tests, applied only migrations and deployed the custom domain.
3. Local disposable API smoke checks passed: capture, duplicate handling, title/note/tag edits, search, lifecycle changes, opening, export and persistence across fresh requests. Four created items were removed by the script.
4. Local Worker metadata fetched real HTML from example.com, Apple Developer Documentation and MDN. An intentionally unavailable `.invalid` hostname failed safely. Saved URLs and notes were preserved in all cases. These are local-network results, not deployed metadata results.
5. Rediscovery eligibility is covered by isolated D1 tests, including age, recent opening and finished/archived exclusions.
6. A desktop Brave viewport at 390 by 740 showed the short-note sheet at approximately 395px tall. Its body had no overflow; Close, Open original and Actions remained visible. This is browser viewport testing, not Android hardware or software-keyboard testing.
7. Signed-out HTTPS requests returned 200 for `/`, `/manifest.webmanifest` and `/sw.js`. `/app`, `/app/`, `/app/inbox`, `/api`, `/api/` and `/api/links` returned 302 rather than private data.
8. The Worker dashboard shows the intended D1 and asset bindings, custom domain and version. Its overview reported zero errors at inspection. A direct-origin-hostname HTTPS request returned 200 with successful TLS verification in approximately 0.5 seconds.

## DNS observation

Immediately after deployment, the Mac and Brave reported the hostname unresolved. Queries to both 1.1.1.1 and 8.8.8.8 returned Cloudflare addresses `104.21.34.227` and `172.67.165.240`. The HTTPS checks above used curl's `--resolve` with the correct hostname and normal TLS verification. The Mac's ordinary resolver and Brave still returned the earlier lookup failure at the last check. This suggests local negative DNS caching; it does not establish a Worker failure. No system DNS configuration was changed.

## Still unverified

- Real second-identity denial and natural 24-hour session expiry. Worker tests cover these identities/expiry cases; the share follow-up below verifies live logout, session invalidation and reauthentication.
- Full production title/tag editing, search, lifecycle, rediscovery and export. The share follow-up verifies capture, note editing before save, duplicates, deletion, reload persistence and example.com metadata.
- Runtime denial on preview URLs, beyond the deployed configuration setting.
- The full reduced-height editor/menu/confirmation follow-up after these changes. Earlier source documentation contains September 22 viewport evidence and is not new evidence from this run.
- Physical Android Chrome installation, standalone launch, session persistence, keyboard, rotation, external links and offline/reconnect. `adb devices -l` showed no connected device.

The service-worker privacy tests pass: only the generic offline page is cached, not private notes, documents, authentication or API responses. Physical-device offline behavior remains untested.

## Share-target follow-up

Version `5819c6d9-f6bc-46c8-a7f6-305f65d79c9e` adds the authenticated Android share draft. Build and all 21 tests passed during deployment. Normal DNS resolution now works on the Mac. Live authenticated save/reload/duplicate checks, logout and draft-preserving reauthentication passed; disposable production data was removed. See [SHARING.md](SHARING.md) for exact evidence and remaining Android checks. The owner reported home-screen installation worked on their phone before this update; Codex has not tested the phone's new share-menu entry.
