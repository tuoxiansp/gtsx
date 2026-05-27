# gtsx Playground

Validation fixtures shaped like real framework projects. Each proves the `.g.tsx` protocol works through a different Host without gtsx owning the bundler.

## Structure

Every fixture:
- Links to the upstream issue that motivated its Host shape
- Exposes standard gtsx commands: `pnpm gtsx:check`, `pnpm gtsx:serve`, `pnpm gtsx:capture`
- Writes capture output to the repository-level `snapshots/` folder

## Fixtures

| Fixture | Host | Upstream |
|---------|------|----------|
| [`tanstack-start-root-provider-error`](./tanstack-start-root-provider-error/) | TanStack Start | [TanStack/router#7133](https://github.com/TanStack/router/issues/7133) |
| [`next-app-router-init-structure`](./next-app-router-init-structure/) | Next.js App Router | [vercel/next.js#59845](https://github.com/vercel/next.js/issues/59845) |
| [`vite-react-ts-tanstack-router`](./vite-react-ts-tanstack-router/) | Vite React + TanStack Router | [vitejs/vite#21614](https://github.com/vitejs/vite/issues/21614) |

## Planned

- `gtsx-self-studio`: managed Host for `packages/gtsx` — gtsx Studio developing itself while preserving normal tests and examples as escape hatches.
