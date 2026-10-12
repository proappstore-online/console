# Creator Console — agent instructions

Repository guidance for Codex and other agents. See `CLAUDE.md` for the rest.

## Delivery mode

**Straight to `main`. No branches, no pull requests.** Declared 2026-08-16.

A push to `main` deploys the console to production through Cloudflare Pages.

### Hard rule: No branches. No pull requests. Ever.

Commit directly to `main`. Do not run `git checkout -b`, `git switch -c`, or `gh pr create`. If you
find yourself on a non-`main` branch, stop and report it. (Declared 2026-08-16.)
