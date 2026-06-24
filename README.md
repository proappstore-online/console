# Creator Console

The multi-tenant admin portal for **ProAppStore** creators — manage apps, drive the
agent build teams, and configure everything from one place. Lives at
[console.proappstore.online](https://console.proappstore.online) (also served at
`proappstore.online/app/`).

> This started from the standalone-app template and has since grown into the
> platform's own control plane. (The README you may have seen describing a
> "FreeAppStore template" was leftover scaffolding — this is the real thing.)

## What it does

- **Dashboard** — your apps, stats, one-tap "new app".
- **Per-app workspace** (tabbed):
  - **Research** — chat with the *Architect* agent; browse the live Knowledge Base.
  - **Build** — the PO + BA/Dev/QA agent board (Kanban / List), live activity, cost.
  - **Data** — D1 browser (tables, SQL query, schema graph).
  - **Test** — the QA agent; Playwright / vitest specs and run history.
  - **Control** — code-health report.
  - **Analytics** — usage + visitor analytics.
  - **Spending** — per-project agent cost breakdown.
  - **Style** — design tokens.
  - **Settings** — storefront listing, publishing, agents, integrations, access.
- **Payouts / Subscription / Services / Profile** — account-level.
- **Push notifications** — pinged when an agent task needs input, finishes, or fails.

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · `@proappstore/sdk`. PWA (vite-plugin-pwa).
Talks to the PAS API (`api.proappstore.online`) and the agent-teams worker
(`agents.proappstore.online`).

## Develop

```bash
pnpm install
pnpm dev              # local dev server
pnpm build            # production build → web/dist/
npx tsc -b            # typecheck — vite does NOT typecheck, run this
npx playwright test   # e2e (web/e2e/*.spec.ts)
```

## Deploy

Push to `main` → auto-deploys via **Cloudflare Pages**. No manual deploys.

## Notes

- **Mobile-first:** every flow works from ~360px — bottom tab bar, bottom-sheet
  ticket detail, scroll-bounded chat/KB panels.
- **Resilient:** a section-level `ErrorBoundary` wraps each view, so one bad section
  shows a local fallback instead of white-screening the whole console.
- **Markdown is sanitized** (`rehype-sanitize`) — agent-authored content can't inject
  script into your session.

For platform conventions, read <https://proappstore.online/skills.md> before changing
anything. Repo-specific AI guidance is in [`CLAUDE.md`](./CLAUDE.md).

## License

MIT.
