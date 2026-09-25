# Private ChatGPT connector

Endpoint: your configured `appOrigin` plus `/mcp` (stateless MCP Streamable HTTP).

For example, `https://later.example.com/mcp`, after completing [deployment setup](DEPLOYMENT.md#before-you-start). Use your own Access application and AUD. Historical account/version identifiers have been omitted from this public record.

## Tools

| Tool | Behavior |
| --- | --- |
| `search_links` | Search title, URL, note and tags; optional status/tag filters; 50-item cursor pages |
| `get_link` | Read one saved item, including its note |
| `save_link` | Save URL and optional note; duplicate returns `existingId` without overwriting |
| `update_link` | Replace supplied title, note or tags; omitted fields stay unchanged |
| `set_link_status` | Move between Inbox, Library, Finished and Archive |
| `upsert_link` | Save URL, title, note, tags and status together; return duplicates unchanged unless explicitly merging |
| `append_note` | Append text with a blank-line separator without replacing the existing note |
| `add_tags` | Add tags without replacing existing tags or their order |

No permanent deletion, bulk deletion, settings, SQL, arbitrary API proxy or export tool is exposed. Editing notes/tags can overwrite content, so the edit tool is marked destructive for client approval purposes. Archive is reversible. Annotations guide the client; they do not enforce authorization.

`save_link` uses the same `worker/library.ts` implementation as the browser API. The three additive tools use `worker/library-mutations.ts`. URL and note are inserted before metadata fetching, which follows existing settings. Saving can contact the submitted website and is marked open-world. Reads and edits do not fetch external sites.

### Additive tool contract

- All three new tools require `requestId`: 8–128 letters, digits, underscores or hyphens. Generate a fresh ID for each intended operation and reuse it, with identical input, after a timeout or other uncertain result.
- `upsert_link` defaults to `onDuplicate: "return"`. An existing normalized URL is returned without changing any supplied fields. Explicit `onDuplicate: "merge"` appends the supplied note and unions tags; title and status still apply only on creation. An omitted status uses the library's default capture status.
- `append_note` requires nonblank text. `add_tags` requires at least one tag and uses the database's ASCII case-insensitive matching, retaining existing tag order and appending new tags.
- Combined limits are checked in the D1 transaction: 4000 note characters and 12 tags. An over-limit operation fails without partial edits or truncation.
- Each response contains `link`, `outcome` and `replayed`. A retry returns the current item, not a historical snapshot. Reusing an ID with different input fails with conflict. Retrying an operation whose item was deleted returns a gone error and does not recreate it.
- Migration `0002_library_operations.sql` adds durable receipts containing request ID, payload hash, item ID and outcome, not copies of notes. Receipts and edits commit together. Receipts are retained after deletion and currently have no automatic expiry; failed transactions leave no receipt.

`get_link_content`, batch capture, semantic search, recommendations and additional item fields are not implemented. `get_link` still returns only the metadata and notes Later stores, not extracted article or thread text.

## Authentication and privacy

- A separate owner-only Cloudflare Access application protects `/mcp` and descendants. `/app` and `/api` keep their existing protection.
- Cloudflare Managed OAuth handles discovery, registration, authorization and token exchange. Cloudflare labels this service **Beta**, independent of npm dependency stability.
- Cloudflare resolves its opaque bearer tokens and supplies `Cf-Access-Jwt-Assertion`. The Worker independently verifies signature, issuer, expiry, exact owner email and **MCP_ACCESS_AUD** on every request.
- A missing MCP audience, or one equal to the website audience, disables the connector. Website assertions cannot call MCP; MCP assertions cannot call `/api`.
- Only the canonical hostname is accepted. A supplied Origin must match Later. Browser API mutation Origin checks remain unchanged.
- Requests are limited to 32 KiB, no batches, 120 MCP requests/minute and the shared 60 writes/minute. Responses use `no-store`; the service worker ignores MCP and OAuth discovery.
- This single-owner connector authorizes a fixed tool set as a unit, not separate read/write OAuth scopes.

Connecting allows requested private notes and links to be returned to ChatGPT. They then fall under ChatGPT's conversation/data settings. Later's no-cache policy does not remove content already returned to a chat. Saved content is untrusted data, not instructions to invoke tools or disclose other items.

## Setup

First finish the website setup in [DEPLOYMENT.md](DEPLOYMENT.md), including a verified owner sign-in. The connector is optional. It uses the same D1 library and GitHub identity provider, but a separate Access application and audience. You do not need another GitHub OAuth app.

1. In your Cloudflare account, create `Later ChatGPT connector`, a self-hosted Access app at your Later hostname with path `mcp`. Verify coverage of `/mcp` and its descendants. Reuse your exact-owner policy requiring GitHub. Allow only your GitHub IdP; leave WARP off. Do not include `/app` or `/api` in this separate application.
2. Enable HTTP-only cookies and hide the endpoint from App Launcher. Leave **Enforce cookie path attribute off for the MCP Access application**. This is the working production configuration after the consent failure described below; the website application is unchanged. The connector cookie is hostname-scoped, but its audience and owner checks still apply.
3. Enable Managed OAuth. Disable localhost and loopback clients. Allow these documented ChatGPT callbacks only:
   - `https://chatgpt.com/connector_platform_oauth_redirect`
   - `https://chatgpt.com/connector/oauth/*`
4. Keep access tokens short-lived: **Default** is 15 minutes. Set **Grant session duration** explicitly instead of inheriting the website's session. Choose **2 weeks** or **1 month** if daily reconnection is unwanted. This is how long the refresh grant lasts; Cloudflare re-evaluates policy during refresh. Longer grants allow an authorized client to keep renewing access for longer, and grant expiry or revocation still requires reauthorization. Save the application. See [Managed OAuth settings](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/).
5. Copy this new application's AUD from its additional settings. Add a `mcpAccessAudience` property to your ignored `deployment.config.json`, alongside the existing fields. It must be the separate 64-character MCP AUD, not the website `accessAudience`, application UUID or GitHub client ID. Keep `accessAudience` pointing to the website app. AUDs are identifiers, not secrets.
6. Run `npm run deploy`. It builds, tests and applies pending D1 migrations before deployment. The additive tools require migration `0002_library_operations.sql`; no production fixtures are inserted.
7. Check anonymous non-browser requests receive an OAuth discovery challenge, not the React page or a tools list.
8. In ChatGPT developer mode, create a private custom connector with your `https://YOUR_LATER_HOST/mcp` endpoint and OAuth. Use managed registration, not the GitHub IdP client secret. Review the requested access and sign in as your exact owner. No public-directory submission is needed. After server tool changes, refresh the installed connector's tool definitions and check the expected eight tools appear.

The two ChatGPT callback patterns above belong in Managed OAuth's allowlist, not in the GitHub OAuth App. GitHub's callback remains `https://YOUR_TEAM.cloudflareaccess.com/cdn-cgi/access/callback`. These are two separate OAuth relationships: GitHub authenticates you to Cloudflare; Managed OAuth authorizes ChatGPT to call Later.

After changing grant duration, reconnect to obtain a fresh grant rather than assuming an existing grant was extended. Verify an actual tool call after more than 15 minutes and again after a day. Tool discovery alone does not prove refresh works. No refresh tokens or client secrets should be copied into Later's source or deployment config.

### Reference deployment session change, 2026-09-24

The owner reported expiry after 24 hours. The dashboard showed the MCP grant inherited the 24-hour application session. The owner saved **1 month** for the OAuth grant; reopening the settings confirmed it persisted while access token lifetime remained **Default (15 minutes)** and the application session stayed 24 hours. This is saved-configuration evidence, not a completed month-long persistence test. Earlier verification entries below describe the previous settings.

To disable connector operations independently, remove `mcpAccessAudience` and redeploy. Do not merely delete Access protection while leaving an enabled Worker audience. Manage/revoke the Access grants and tokens in Cloudflare; a ChatGPT disconnect alone is not proof of token revocation.

## Dependency choices

Pinned stable direct packages: MCP SDK 1.30.0, Zod 4.6.5, Vite 8.3.0, Cloudflare Vite plugin 1.47.0, Wrangler 4.114.0 and Miniflare 4.20260730.0. Plugin 1.57.3 was not selected because it introduces Miniflare 5 alpha.

Overrides deduplicate Miniflare on stable v4 and patch its pinned Sharp to 0.35.4 and Undici to 7.29.0, addressing reported advisories. Cloudflare's upstream development tooling still includes prerelease-labeled internal packages (`unenv`, `youch`); no new top-level prerelease dependency was chosen. Reassess overrides on upgrades. The lockfile records exact resolutions. Zero reported advisories is not a guarantee of vulnerability-free software.

## Additive-tool release verification, 2026-09-23

- `npm run deploy` passed the production build and all **32 tests**, applied `0002_library_operations.sql` to the production D1 database, and deployed Worker version `[identifier omitted]`. MCP server version is `1.1.0`. No production reading items or fixtures were inserted.
- The SDK integration test discovers all eight tools from the compiled Worker and exercises the three new tools against disposable D1. Focused D1 tests cover concurrent upserts/appends/tag additions, duplicate request IDs, conflicting reuse, combined limits with no partial edits, retry after deletion, curated-field preservation and metadata failure.
- Live anonymous checks: `/` is 200; `/app`, `/app/share`, `/api` and `/api/links` are 302; `/mcp` and `/mcp/child` are 401 with OAuth challenges and private/no-store headers. Invalid bearer is 401. Resource discovery is 200. The workers.dev address remains 404.
- Refreshed Later in ChatGPT's plugin settings. The authenticated settings page visibly lists all **eight tools**, including `upsert_link`, `append_note` and `add_tags`, with the expected required request IDs and strict schemas. This is observed production tool discovery, not proof of successful production mutations.
- No dependency versions, Access settings, owner policy, service-worker caching or frontend design changed for this release.
- Re-ran `npm audit --omit=dev` and full `npm audit`: both report zero known vulnerabilities.

**Still unverified:** actual new-tool calls through a ChatGPT conversation, production token refresh/revocation/expiry and denial using a second real GitHub identity. Local tests cover generated expired/non-owner assertions, not those live identity flows. Article extraction remains deferred.

## Initial five-tool verification, 2026-09-23

Observed locally:

- Production build and **23 tests pass**.
- Both `npm audit --omit=dev` and full `npm audit`: **0 known vulnerabilities**.
- Actual MCP SDK client connects to the compiled Worker in Miniflare, discovers exactly five tools, and performs capture, duplicate, edit, search, read and lifecycle operations against disposable D1.
- Generated signed-token tests reject missing/malformed/expired/non-owner assertions, cross-audience use, foreign Origin and alternate hostname. Missing/reused audience fails closed.
- Body/schema bounds, unknown/delete tools, write limits and no-store behavior tested. Existing API, metadata failure, mobile-share and service-worker checks remain passing.

Local tests use generated signing keys and mocked external identity/metadata services, not production credentials. Use only disposable items for live mutation checks.

Observed in production after owner approval:

- Created Access application `[identifier omitted]` with the existing exact-owner policy, GitHub-only login, path-scoped HTTP-only cookies and Managed OAuth. Saved settings show localhost/loopback callbacks disabled, the two ChatGPT callback patterns, 24-hour application/grant duration and default 15-minute access-token lifetime.
- Deployed Worker version `[identifier omitted]` through the deployment script. All 23 tests passed again; no D1 migrations were pending. No production items or fixtures were inserted.
- Anonymous `/mcp` and `/mcp/child` requests return 401 with `WWW-Authenticate`. An invalid bearer token also returns 401. Responses are private/no-store.
- `/.well-known/cloudflare-access-protected-resource/mcp` returns 200, identifies the exact MCP resource and the configured Access authorization server. Server discovery returns 200 and advertises S256 PKCE, authorization-code/refresh grants, registration, token and revocation endpoints. Discovery is configuration evidence, not a completed grant or revocation test.
- `/` remains public (200); `/app`, `/app/share`, `/api` and `/api/links` remain Access-protected (302). The alternate workers.dev URL returns 404.

### ChatGPT connection follow-up

- Initially ChatGPT installed the connector but listed no tools. Sign-in returned `invalid_request` with `Consent request is malformed`.
- Cloudflare Access authentication logs showed the owner was allowed for the connector, including the retry at 11:04 AM IST. This locates the observed failure after identity/policy evaluation, not an owner-policy rejection.
- With explicit owner approval, disabled only **Enforce cookie path attribute** on the MCP application and saved it. A subsequent dashboard read confirmed the setting was off while HTTP-only and Managed OAuth remained on. No Worker, policy, callback or token-lifetime change was made during this test.
- Browser automation stalled during the retry. The owner then completed sign-in and reported that ChatGPT could access Later, supplying the list of all five expected tools. Successful connection and tool discovery are **owner-reported**, not independently observed tool execution.
- Keep cookie path enforcement off for this connector. The before/after result supports a cookie-path interaction with Managed OAuth consent; the precise Cloudflare-internal mechanism has not been traced.

**Remaining:** independently observed authenticated read/write tool operations, production refresh/revocation/expiry, and denial using a second real GitHub identity. Use disposable items for live mutation checks. Do not treat tool discovery or local SDK tests as proof of these flows.

## References

- [Cloudflare Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [OpenAI MCP tools](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI authentication and callback URIs](https://developers.openai.com/plugins/build/auth)
- [Connect from ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
