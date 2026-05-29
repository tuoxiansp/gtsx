# Project Detection

Read this before choosing an integration profile.

## Model

- gtsx Project = selected TypeScript project + `.g.tsx` protocol.
- gtsx Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Host topology = either client-only React or client+server React.
- Adapter = package that makes the Host understand gtsx transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.
- Validated profile = a tested framework-specific integration path. 0.0.1 validated profiles are Vite React and Next.js App Router.
- Integration contract = framework-neutral wiring to adapt when no validated profile exists.

## Required Contract

Every successful integration needs:

1. TypeScript Program scope for `.g.tsx` discovery.
2. React transform for `.g.tsx` component boundaries.
3. Project index / manifest built from the selected scope.
4. Preview route that maps `entry`, `case`, and `gcase` search params to the preview client.
5. Studio route that renders `StudioShell` with the manifest.
6. Stable `preview.serve`, `preview.url`, `preview.allUrl`, and optional `preview.studioUrl` commands for verification and capture.

## Supported Project Scope

setup-gtsx 0.0.1 supports TypeScript React projects. A supported project has:

- A TypeScript Program that includes React source and can include `.g.tsx` files.
- A React host with a browser entry or framework routes.
- A bundler/framework hook where `.g.tsx` files can run through the gtsx React transform.

JavaScript-only React projects, non-React projects, and projects without a selectable TypeScript Program are outside the setup-gtsx 0.0.1 setup scope.

## Detection Steps

1. Detect package manager and workspace layout.
2. Resolve the TypeScript project:
   - Prefer explicit `-p` / `--project` user input.
   - Otherwise: nearest `tsconfig.json`.
   - If the nearest `tsconfig.json` is a project-reference container with `files: []`, choose the app config that includes React source, such as `tsconfig.app.json` in create-vite templates.
3. Detect host topology:
   - Browser-owned entry and browser-owned routing -> client-only React.
   - Server routes, SSR, static route generation, framework route files, or islands -> client+server React.
4. Select the most specific integration profile:
   - Vite React before client runtime.
   - Next.js App Router before server runtime.
   - Client Runtime for client-only React hosts such as CRA/Webpack, Vite-compatible SPA variants, and isolated Electron renderers.
   - Server Runtime for server/static/islands hosts such as Next.js Pages Router, Remix / React Router framework mode, TanStack Start, Astro, and Gatsby.

## Common Configuration Rules

- Always install `@gtsx/core` and `@gtsx/studio`.
- Install `@gtsx/adapter-vite-react` only for Vite-compatible client-only hosts.
- Install `@gtsx/adapter-next-react` only for Next.js App Router.
- Put selected root, optional tsconfig, stable cache namespace, routes, and preview commands in `gtsx.config.ts`.
- Use the package name or repo slug as `project.namespace`, not a file hash.
- Choose `project.root: "src"` when TypeScript source lives under `src`; choose `project.root: "."` for root-level `app`, `pages`, `components`, or `lib`.
- Generate `preview.serve` for the detected package manager and host. Do not hard-code `pnpm` in npm/yarn/bun projects.
- Keep `preview.studioUrl`, `preview.url`, and `preview.allUrl` on the same host bound by `preview.serve`; when serving on `127.0.0.1`, use `127.0.0.1` in URLs instead of `localhost`.

## Verification

1. Run project typecheck.
2. Run `gtsx check` against the selected scope or a `.g.tsx` file.
3. Start the host dev server.
4. Open `/gtsx/studio`.
5. Confirm the manifest contains only TypeScript Program `.g.tsx` entries. A setup-only project may legitimately have zero entries; Studio should show its empty state.
6. If at least one `.g.tsx` entry exists, open one `/gtsx?...` preview URL.
7. Confirm no `Missing entry`, `Unknown gtsx entry`, or `Unknown gtsx case` errors.
8. Run `gtsx capture` when configured.

## Report

After completion, tell the user:

- Files changed
- Packages installed
- Selected TypeScript project
- Selected host and integration profile
- Verification results
- Any skipped steps
- The Studio URL to open
