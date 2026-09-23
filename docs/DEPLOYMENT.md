# Deploy Later to Cloudflare

For the optional owner-only ChatGPT connector, follow [CONNECTOR.md](CONNECTOR.md). Its separate Access AUD is set as `mcpAccessAudience` in the ignored deployment config; omitting it disables MCP without changing website authentication.

The production hostname is `later.xplo8e.com`. The first deployment completed on 23 September 2026. See [DEPLOYMENT-RUN.md](DEPLOYMENT-RUN.md) for the actual configuration, verification results and remaining checks. The steps below also describe subsequent deployments.

## 1. Account and database

Use the Cloudflare account that owns the `xplo8e.com` zone. Authenticate Wrangler through its supported sign-in flow:

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 create later
```

Record the account ID and the returned database UUID. Keep credentials outside the repository. `deployment.config.json` and the generated production configuration are ignored by git.

## 2. GitHub identity provider

Configure GitHub as an identity provider in Cloudflare Zero Trust. Its OAuth application uses:

- Homepage: `https://YOUR_TEAM.cloudflareaccess.com`
- Callback: `https://YOUR_TEAM.cloudflareaccess.com/cdn-cgi/access/callback`

Enter the GitHub OAuth client ID and secret into the Cloudflare identity-provider configuration, not this application. Follow the [Cloudflare GitHub identity-provider guide](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/).

## 3. Protect the private paths

Before publishing, create one self-hosted Access application with these destinations on `later.xplo8e.com`:

| Path | Access |
| --- | --- |
| `/` | Public login page |
| `/app` and `/app/*` | Owner only |
| `/api` and `/api/*` | Owner only |
| `/manifest.webmanifest`, `/icons/*`, `/sw.js`, `/offline.html`, `/assets/*` | Public static assets |

Use the exact owner email returned by the configured GitHub identity provider. Restrict the application to that owner and the GitHub sign-in method. Keep other identities blocked. Do not add an Everyone or Bypass policy to the private paths.

Record the application's audience (AUD) tag and Access team domain. The Worker independently verifies the assertion signature, issuer, audience, expiry and owner email. An email header alone is not accepted. See [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and [Access path rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).

## 4. Prepare and publish

Copy `deployment.config.json.example` to `deployment.config.json` and replace every placeholder:

| Field | Required value |
| --- | --- |
| `accountId` | Cloudflare account ID |
| `databaseId` | D1 database UUID |
| `databaseName` | `later`, or the name created above |
| `accessTeamDomain` | Full `https://YOUR_TEAM.cloudflareaccess.com` origin |
| `accessAudience` | Access application AUD tag |
| `ownerEmail` | Exact permitted identity email |

```bash
npm run deploy -- --prepare-only
```

Review `wrangler.production.json`. It should bind the intended D1 database and the `later.xplo8e.com` custom domain. Both `workers_dev` and preview URLs are disabled. Then deploy:

```bash
npm run deploy
```

This command verifies authentication, builds with the production configuration, checks that local authorization was removed, runs the tests, applies the migration to the configured remote database, and publishes the compiled Worker/assets. It does not create the GitHub OAuth app or Access policies for you, and it does not seed production with the design fixtures.

The [Cloudflare Vite guide](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) explains the generated build configuration used by deployment.

## 5. Live acceptance checks

1. In a signed-out browser, `/` shows the login screen, and `/app/` requires GitHub sign-in. The private API must not return library data anonymously.
2. Sign in as the configured owner. Save a link with a note, reload, edit it, search for it, move it to Finished and export the library.
3. Verify that a different GitHub identity is denied. Confirm the alternate Workers deployment URLs are disabled.
4. Check live metadata extraction from several ordinary public websites. A metadata failure must preserve the saved URL and note.
5. On Android Chrome, open the HTTPS site, sign in, then choose Add to Home screen / Install app from Chrome's menu, or Install Later in Settings when Chrome exposes the prompt.
6. Launch the installed icon and verify standalone appearance, sign-in persistence, short and long screens, text entry with the keyboard, rotation, and external-link behavior.
7. Launch once while online, then disconnect and reload. The generic offline screen should appear. Reconnect and retry. Private notes and API responses must not be available from the service-worker cache.

PWA installation requires HTTPS or a supported loopback development origin. The current remote development preview is not evidence of a successful Android install. See [installability requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [the optional in-app install prompt](https://web.dev/articles/customize-install).

## Operations

Export from Settings for a user-readable snapshot. D1 recovery and backups are managed in the Cloudflare account. The delete-all action is deliberately gated by typed confirmation. Schema changes should be added as new migrations; do not edit an already applied migration.

The application is configured for one owner. Changing owners requires changing both the Access policy and `ownerEmail`, followed by deployment. No public registration or sharing is implemented.
