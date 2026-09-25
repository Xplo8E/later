# Android share target

## Behavior

The manifest registers `/app/share` using GET with `url`, `text` and `title` parameters. This opens a draft, not a database mutation. Android often puts a URL in `text`; the parser handles that and a title-only URL as well. Extra shared context prefills the editable note. Invalid or oversized URLs are rejected, and notes beyond 4,000 characters are shortened with an explicit warning.

The route is beneath the existing `/app` Cloudflare Access destination. Access authentication and the Worker's independent JWT verification both still apply. There is no public share-save endpoint, bypass policy or new database permission. Only the owner's authenticated, same-origin POST to `/api/links` saves the draft, after tapping Save. Existing duplicate detection is reused.

An initial signed-out request carries its share parameters through Access's redirect. If the API session expires after the form opens, draft edits are retained in React memory and the sign-in link returns to a fixed same-origin `/app/share` URL with the draft. No arbitrary return URL is accepted. Save or Cancel replaces the share URL with the destination library page.

GET share data is carried in URL query parameters, so it can be present in browser history and Cloudflare request/authentication URLs. It is not a secret transport or suitable for credentials. Later does not add localStorage, sessionStorage, IndexedDB or service-worker caching for drafts. App documents and API responses remain no-store, and the service worker still caches only the generic offline page. An offline share cannot be saved; reconnect and retry or share again.

## Checks on 23 September 2026

- Build and 21 tests pass.
- Parser tests cover explicit URLs, Android text/title payloads, embedded links, fragments/query strings, credential-bearing/non-HTTP/oversized URLs, note bounds and reauthentication round trips.
- Compiled Worker tests confirm owner access to the share document, unchanged query parameters, no-store responses and zero saved items from merely opening a share.
- Compiled Worker tests reject unauthenticated, expired and non-owner sessions before serving share content.
- Service-worker tests cover online and offline `/app/share` navigation without caching shared content.
- Local desktop Brave viewport testing at 320 by 480 verified prefill, note editing, Save, duplicate warning and opening the unchanged existing note. The disposable item was deleted; other local data was retained.
- Cancel returned to Inbox and removed the share parameters. Invalid-share UI was checked at 280 by 320 with no horizontal document overflow.

These are automated and desktop-browser results, not physical Android share-intent evidence.

## Live verification

- Deployed to `[configured application origin]`, Worker version `[identifier omitted]`. The deployment script rebuilt, passed all 21 tests and found no new migrations.
- The live manifest returns the configured share target. Public `/` returns 200. Signed-out `/app/share`, `/app/share/` and `/api/links` return Access redirects. The share redirect's return URL retains the original query parameters.
- The authenticated production browser opened the share form with the correct URL and context. Saving a disposable link and edited note succeeded; reload preserved both. Metadata resolved to Example Domain. Sharing it again produced the duplicate warning and preserved the original note.
- The disposable production item was deleted and the pre-existing library remained intact.
- Sign out displayed Cloudflare's successful-logout screen. Opening a new share returned through authentication to the correct draft using the existing GitHub browser session. This was not a fresh password/MFA-entry test.
- For a stronger session-loss check, a draft was edited in one tab and Access was logged out in another. Save then showed the private-library/sign-in screen, without creating the item. The Sign in again link retained the URL and edited note; both were restored after reauthentication. Cancel returned to Inbox with no share query. This tests real session invalidation, not waiting 24 hours for natural expiry.
- Actual Android share-sheet registration and launch remain user-device checks. No phone automation or physical share-intent test was performed by Codex.

## Phone acceptance

1. Open Later online in Android Chrome. Refresh or reinstall the installed PWA if its old manifest has not updated.
2. Share a webpage from Chrome and a link from another app. Later should appear in the Android share sheet.
3. Choose Later. Verify the URL, title/context, optional note and Save/Cancel controls. Nothing should enter the library until Save is pressed.
4. Share the same URL again. Confirm a duplicate warning and that the existing note stays unchanged.
5. Sign out, then share a link. Confirm owner GitHub sign-in returns to that draft and saving works only after authentication.
6. Check keyboard, rotation, app relaunch, offline/reconnect and a second incoming share. Do not treat a simulated viewport as proof of these device behaviors.

User reported successful Android home-screen installation before this feature was added. Share-sheet registration and this new flow still require physical-device verification.

Reference: [Chrome Web Share Target documentation](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target).
