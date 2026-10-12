# Creator Console

Multi-tenant admin portal for ProAppStore creators.

- Subdomain: `console.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)

For platform conventions, read
https://proappstore.online/skills.md
before writing or changing anything.

## Delivery mode

**Straight to `main`. No branches, no pull requests.** Declared 2026-08-16.

Commit directly to `main` and push. Do not run `git checkout -b`, `git switch -c`, or `gh pr create`.
If you find yourself on a non-`main` branch, stop and report it. A push to `main` deploys the console
to production through Cloudflare Pages, and `.github/workflows/pw.yml` then runs the Playwright smoke
tests against production.
