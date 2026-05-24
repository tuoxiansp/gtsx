# GTSX Playground

This folder contains representative Host/Adapter validation projects. The
fixtures are shaped like real framework projects so GTSX can prove that the
same `.g.tsx` protocol works through different execution environments without
making GTSX own their bundlers.

Playground projects validate rendering and integration behavior. They do not
define GTSX Scope by themselves. Scope should follow the selected TypeScript
Project; the Host renders that scope but does not expand it.

Each example records the upstream issue that motivated the Host shape and
exposes the same GTSX preview commands:

- `pnpm gtsx:check`
- `pnpm gtsx:serve`
- `pnpm gtsx:capture`

Capture commands write screenshots to the repository-level `snapshots/` folder
so full-chain test output is collected in one place.

## Examples

- `tanstack-start-root-provider-error`: inspired by TanStack/router#7133, where
  a root provider failure in TanStack Start returns raw JSON instead of a route
  error boundary.
- `next-app-router-init-structure`: inspired by vercel/next.js#59845, where a
  created App Router project is expected to have a valid root `app/page.tsx`
  and route-handler structure.
- `vite-react-ts-tanstack-router`: inspired by vitejs/vite#21614, where
  create-vite's React + TanStack Router flow failed for pnpm/bun users.

## Planned Fixtures

- `gtsx-self-studio`: a managed Host for the `packages/gtsx` TypeScript Project,
  used to validate GTSX Studio developing itself while preserving normal tests
  and examples as escape hatches.
