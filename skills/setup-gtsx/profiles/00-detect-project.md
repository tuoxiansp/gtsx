# Project Detection

Read this before choosing an integration profile.

## Model

- gtsx Project = selected TypeScript project + `.g.tsx` protocol.
- gtsx Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Host topology = either client-only React or client+server React.
- Adapter = package that makes the Host understand gtsx transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.
- Validated profile = a tested framework-specific integration path. Validated profiles are Vite React and Next.js App Router.
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

setup-gtsx supports TypeScript React projects. A supported project has:

- A TypeScript Program that includes React source and can include `.g.tsx` files.
- A React host with a browser entry or framework routes.
- A bundler/framework hook where `.g.tsx` files can run through the gtsx React transform.

JavaScript-only React projects, non-React projects, and projects without a selectable TypeScript Program are outside the setup-gtsx setup scope.

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

## Existing Integration Detection

Before selecting write actions, check whether the project is already integrated:

- gtsx packages in dependencies or devDependencies.
- `gtsx.config.ts` or an equivalent local gtsx config import.
- Adapter wrappers in `vite.config.*`, `next.config.*`, or another framework config.
- Existing `/gtsx`, `/gtsx/studio`, or `/gtsx/studio/manifest` route files or browser-entry branches.
- Existing `.gtsx/preview-entries.ts` imports or adapter-generated output.

If any of these are present, classify the task as upgrade/ensure mode unless the user explicitly asked for a full reinstall. In upgrade/ensure mode:

- Update gtsx packages, then audit whether the existing glue still matches the upgraded package contracts.
- Preserve existing route files, config wrappers, browser-entry branches, URL conventions, preview commands, and local customizations.
- Change glue only when typecheck, adapter exports/types, package examples/docs, generated-file errors, or runtime verification show that a version migration is required.
- If the adapter package or wrapper must change, preserve the existing wrapper composition order and explain the change.
- Ensure the conventional design directory exists at `project.root/gtsx/design`.
- Verify the integration and report which existing glue files were intentionally left unchanged.

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
5. Open `/gtsx/studio#/design`.
6. Confirm the manifest contains TypeScript Program `.g.tsx` entries, including design frames from `project.root/gtsx/design` when present. A setup-only project may legitimately have zero entries; Studio should show its empty state.
7. If at least one `.g.tsx` entry exists, open one `/gtsx?...` preview URL.
8. Confirm no `Missing entry`, `Unknown gtsx entry`, or `Unknown gtsx case` errors.
9. Run `gtsx capture` when configured.

## Report

After completion, tell the user:

- First-time setup vs upgrade/ensure mode
- Upgrade compatibility audit result, including why any glue migration was or was not needed
- Files changed
- Packages installed
- Selected TypeScript project
- Selected host and integration profile
- Verification results
- Any skipped steps
- The Studio URL to open
