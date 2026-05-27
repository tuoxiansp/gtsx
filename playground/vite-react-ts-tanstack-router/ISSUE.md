# Vite React TS TanStack Router Scaffold

Upstream issue: https://github.com/vitejs/vite/issues/21614

The reported failure happened in create-vite's React + TanStack Router variant
when pnpm/bun passed too many arguments to the downstream create command.

This playground keeps the project shape that matters for gtsx:

- Vite React TypeScript configuration
- Router-like route module under `src/routes`
- A `.g.tsx` entry with cases for scaffold failure, first route, and ready app

gtsx uses the Script adapter so Vite remains the owner of dev/build behavior.
