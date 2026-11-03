# Operating a Guestack instance

This is the operator's guide: what to set up, how to launch, what to check afterwards, and how to re-launch. The operator is deliberately outside the trust boundary: everything that matters is generated and deployed by the attested launcher workflow, and the operator cannot read the keys it creates.

## What a launch does

`.github/workflows/launcher.yml` runs `launcher/launch.sh` and then attests and publishes the launch record. In order:

1. Generates fresh instance keys (three HMAC keys and two P-256 keys) in memory. Nothing is printed; every generated value is masked in the log.
2. Creates two Cloudflare Pages projects with fixed names: `guestack-api` (the functions) and `guestack-page` (the static login page). Both must be new or empty.
3. Stores the seven secrets on the API project.
4. Creates one notification policy that records every deployment event of the two projects in the account's notification history, which cannot be edited or deleted.
5. Deploys the API. If a custom host is configured, attaches it.
6. Writes the page's configuration with the exact API URL (the custom host, or else the API's deployment URL) and deploys the page.
7. Waits until both deployments appear in the notification history.
8. Writes `launch.json`, smoke-tests the live instance, then attests `launch.json` and publishes it as a Release named `launch-<run id>`.

Anyone can verify the record:

```
gh release download launch-<run id> --repo <owner>/guestack-launcher --pattern launch.json
gh attestation verify launch.json --repo <owner>/guestack-launcher \
  --signer-workflow <owner>/guestack-launcher/.github/workflows/launcher.yml
```

## Prerequisites

**Cloudflare**

- The account id.
- An API token with **Pages: Edit** and **Account Notifications (Alerting): Edit** on that account, and nothing else. The launcher never touches R2 or DNS.
- **No enabled notification policies** on the account. The launcher refuses to run otherwise, and aborts if one appears while it runs.
- An e-mail address Cloudflare accepts as a notification destination for the account (an account member's address works). Deployment notifications go there.
- No Pages projects named `guestack-api` or `guestack-page` on the account, or only empty ones. The names are fixed in `launcher/launch.sh`.
- Optional: a custom host for the API (for example `api.example.com`) on a zone in the same account, so the domain can be attached and its DNS record created. Without one, the page calls the API's deployment URL directly.

**Google**

- An OAuth client of type *Web application* with the People API enabled and the scopes `openid` and `https://www.googleapis.com/auth/user.phonenumbers.read`. That scope is *sensitive*: Google requires app verification before more than 100 users can sign in.
- The redirect URI is added after the launch (see below).

**Telegram**

- A bot created with @BotFather, with OpenID Connect login enabled and the `phone` scope available. Keep the default signing algorithm: the alternative algorithms disable the `phone` scope.
- The redirect URI is added after the launch (see below).

**GitHub**

The repository must be public: the attestation is signed through the public Sigstore instance so that anyone can verify it. Set these repository secrets:

| Secret | Value |
|---|---|
| `CF_API_TOKEN` | the Cloudflare API token above |
| `CF_ACCOUNT_ID` | the Cloudflare account id |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth client |
| `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET` | the Telegram OpenID Connect client |
| `OPERATOR_EMAIL` | the notification e-mail address |
| `API_CUSTOM_HOST` | optional: host name only, for example `api.example.com` |

## Running the launch

Actions → **launcher** → *Run workflow* on `main`. It takes a few minutes. Afterwards the run has a `launch-<run id>` artifact and the repository has a `launch-<run id>` Release with `launch.json` attached.

If the run fails, it publishes nothing. Read the `::error::` line, delete whatever it created (see *Re-launching*), fix the cause, and run it again.

## After the launch

1. **Custom host.** If the run printed a warning that the custom host does not answer yet, fix its DNS, then re-run this probe until it prints `400` and `{"error":"bad_envelope"}`. The page calls the API through this host, so logins fail until it answers.

   ```
   curl -s -w '\n%{http_code}\n' -X POST https://<API_CUSTOM_HOST>/v1/issue -H 'content-type: application/json' -d '{}'
   ```

2. **Redirect URIs.** Register the page's deployment URL, `cloudflare.page_project.preview_url` from `launch.json` (for example `https://1a2b3c4d.my-page.pages.dev`), as an authorized redirect URI in the Google Cloud console and in @BotFather. Until then, logins fail at the provider. The trust model does not depend on this step: the page starts every login with its own address as the redirect URI, and an extra URI added by anyone cannot redirect a login the page started.

3. **Monitor and SDK.** Fill the monitor's `expected.json` from the attested `launch.json` and commit it. Then write `PAGE_URL` (the page's deployment URL) and the monitor commit into the SDK's `config.js` and tag an SDK release. Relying parties check both against the attested record.

Use only the deployment URL. The project's `<project>.pages.dev` alias follows whatever is deployed later and must not be given to anyone.

## First launch: please report

Some behaviour can only be observed on a real account. After the first launch, report:

1. **Smoke test.** Whether step 12 passed. A failure mentioning HTTP 503 `integrity` means the deployment URL does not read the production secrets.
2. **Notification history.** The JSON of one history entry for the new policy (`GET /accounts/<id>/alerting/v3/history`; the entries contain no secrets): which field carries the deployment id, how many entries each deployment produced, and roughly how long after the deploy they appeared.
3. **Redirect URIs.** Whether the Google Cloud console and @BotFather accept the deployment URL exactly as in `launch.json`, without a trailing `/`.
4. **Telegram.** Whether a first Telegram login succeeds. If it ends with a provider error, note it. Possible causes are the token endpoint rejecting `client_id` in both the Basic header and the form body, an `aud` claim in an unexpected form, or id_tokens without a `kid`.

## Re-launching

A re-launch creates a new instance: every key changes, so every pseudonymous ID changes too. To re-launch, delete in the Cloudflare dashboard both Pages projects (`guestack-api` and `guestack-page`) and the `guestack-launch-<run id>` notification policy (or disable it), then run the workflow again. History entries of the old policy stay in the account and are ignored.

## What the operator can and cannot do

The operator can delete the projects, which stops the service and is visible. The operator can change the custom host's DNS (traffic is end-to-end encrypted to the attested functions, so this can only break the service). The operator can read the runtime logs (the code logs only fixed status codes) and can run a look-alike copy (relying parties pin the attested page URL and key).

The operator cannot read the generated keys, phone numbers or IDs. The operator cannot redeploy either project without a new entry appearing in the notification history, which the monitor watches.
