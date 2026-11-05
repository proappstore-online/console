# Console handoff for platform#555

This artifact contains the actual Console (promoter, readiness, saved public
profile consumers and installed SDK), with no fixture API, users, tokens or
referral counts. It does not establish joint-flow or real-ledger acceptance.

## Retrieve or rebuild

The `Isolated Console candidate` workflow uploads an immutable Actions artifact
named `console-candidate-<full commit SHA>` on main. Retrieve by exact run/artifact
ID, not a latest alias; record the Actions artifact SHA-256 alongside its manifest.
Artifacts expire after 30 days; rebuild from the recorded source SHA if needed.

On POSIX with Node 22 and pnpm 10.30.3:

```sh
git clone https://github.com/proappstore-online/console.git
cd console
git checkout --detach <full-recorded-main-SHA>
corepack enable
pnpm install --frozen-lockfile
node scripts/build-candidate.mjs
node scripts/check-candidate.mjs
pnpm --filter @console/web exec playwright install chromium
node scripts/smoke-candidate.mjs
```

The command requires clean committed source. `candidate/site/` is the static
site; `candidate/manifest.json` records full source revision, lockfile SHA-256,
Node/pnpm identity, actual installed SDK version and hashes of all SDK dist files,
and SHA-256 of every output. `buildSha256` hashes the compact JSON file-hash map
in manifest order. There are no timestamps or absolute paths in the manifest.
Compare rebuilds on the same Node 22 patch/POSIX environment. The frozen lockfile
records the registry integrity of the SDK package; no SDK source revision is
invented from a package version.

## Harness routing and isolation contract

Serve `site/` at a fresh loopback origin (for example http://127.0.0.1:4180),
with SPA fallback only for document routes. Mount the real local platform API at
`/v1/*`, including `/v1/auth/*`; preserve paths, query, cookies and redirects.
Mount real local host mediation at `/.pas/*` and real agent HTTP/WebSocket routes
at `/candidate-agents/v1/*` (strip `/candidate-agents` upstream). No API request
may fall back to the SPA or to a production upstream. Configure the local backend
return URLs, cookie domains and app/share URLs for this origin. For host cookie
mode the real host must inject its usual `pas-auth-mode` meta; otherwise the SDK
uses its existing bearer return handling. Neither mode replaces SDK auth.init,
callback parsing, sign-in or profile persistence with a fixture implementation.

The harness must block ALL external network at the browser context/network
namespace boundary, including top-level navigation, popups, workers, redirects,
WebSockets and provider hosts. Allow only explicitly listed local component
origins; fail and record attempts outside that list. CSP alone does not restrict
top-level navigation. Run local services with outbound network denied too. Only
the synthetic provider boundary may be faked; real local API/host/ledger responses
must not be intercepted or fulfilled from the Console's synthetic e2e fixtures.
Use a fresh browser profile, no imported storage/cookies, no production secrets,
and service workers blocked. Do not reuse a production browser profile.

Candidate HTML additionally restricts connections, frames, images and forms to
self (images allow data/blob); remote fonts and PWA registration are disabled.
Any remaining external optional features fail closed under that policy. Serve
with the same CSP as an HTTP header if the host rewrites HTML. Never deploy this
artifact to a production host. Normal `pnpm build` still produces `web/dist/`
with production routing; no runtime environment or query switch enables fixtures.

Platform#555 owns synthetic provider setup, shared browser scenario, network
denial evidence and real-ledger assertions. No real users, OAuth grants,
campaigns or production activation are prerequisites of this handoff.
