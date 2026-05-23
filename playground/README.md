# GTSX Playground

This folder contains representative framework-shaped projects used to validate the
GTSX protocol against realistic scaffolds without making GTSX own their bundlers.

Each example records the upstream issue that motivated the shape of the fixture
and exposes the same GTSX script-adapter commands:

- `pnpm gtsx:check`
- `pnpm gtsx:serve`
- `pnpm gtsx:capture`
- `pnpm gtsx:strip`

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
