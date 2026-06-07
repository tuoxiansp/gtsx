# Project Detection

Read this before choosing an integration profile.

## Model

- Runelight Project = selected TypeScript project + `.g.tsx` protocol.
- Runelight Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Host topology = either client-only React or client+server React.
- Adapter = package that makes the Host understand Runelight transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.
- Validated profile = a tested framework-specific integration path. Validated profiles are Vite React and Next.js App Router.
- Integration contract = framework-neutral wiring to adapt when no validated profile exists.

## Required Contract

Every successful integration needs:

1. TypeScript Program scope for `.g.tsx` discovery.
2. React transform for `.g.tsx` component boundaries.
3. Project index / manifest built from the selected scope.
4. Preview route that maps `entry`, `frame`, and `frameOverride` search params to the preview client.
5. Studio route that renders `StudioShell` with the manifest.
6. Stable `preview.serve`, `preview.url`, `preview.allUrl`, and optional `preview.studioUrl` commands for verification and capture.

## Supported Project Scope

The setup-runelight skill supports TypeScript React projects. A supported project has:

- A TypeScript Program that includes React source and can include `.g.tsx` files.
- A React host with a browser entry or framework routes.
- A bundler/framework hook where `.g.tsx` files can run through the Runelight React transform.

JavaScript-only React projects, non-React projects, and projects without a selectable TypeScript Program are outside the setup-runelight scope.

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

- Runelight packages in dependencies or devDependencies.
- `runelight.config.ts` or an equivalent local Runelight config import.
- Adapter wrappers in `vite.config.*`, `next.config.*`, or another framework config.
- Existing `/runelight`, `/runelight/studio`, or `/runelight/studio/manifest` route files or browser-entry branches.
- Existing `.runelight/preview-entries.ts` imports or adapter-generated output.

If any of these are present, classify the task as upgrade/ensure mode unless the user explicitly asked for a full reinstall. In upgrade/ensure mode:

- Update Runelight packages, then audit whether the existing glue still matches the upgraded package contracts.
- Preserve existing route files, config wrappers, browser-entry branches, URL conventions, preview commands, and local customizations.
- Change glue only when typecheck, adapter exports/types, package examples/docs, generated-file errors, or runtime verification show that a version migration is required.
- If the adapter package or wrapper must change, preserve the existing wrapper composition order and explain the change.
- Ensure `runelight.config.ts` records `project.entryRoot`, then ensure `${project.entryRoot}/design` exists.
- Verify the integration and report which existing glue files were intentionally left unchanged.

## Common Configuration Rules

- Always install `@runelight/core` and `@runelight/studio`.
- Install `@runelight/adapter-vite-react` only for Vite-compatible client-only hosts.
- Install `@runelight/adapter-next-react` only for Next.js App Router.
- Put selected root, selected local Runelight entry root, optional tsconfig, stable cache namespace, routes, and preview commands in `runelight.config.ts`.
- Use the package name or repo slug as `project.namespace`, not a file hash.
- Choose `project.sourceRoot: "src"` when TypeScript source lives under `src`; choose `project.sourceRoot: "."` for root-level `app`, `pages`, `components`, or `lib`.
- Choose `project.entryRoot` as the filesystem directory that owns the local `/runelight` entry: usually `app/runelight`, or `src/app/runelight` when the route tree lives under `src/app`. For client-only hosts without filesystem routes, still create and record this logical entry root during setup.
- Generate `preview.serve` for the detected package manager and host. Do not hard-code `pnpm` in npm/yarn/bun projects.
- Keep `preview.studioUrl`, `preview.url`, and `preview.allUrl` on the same host bound by `preview.serve`; when serving on `127.0.0.1`, use `127.0.0.1` in URLs instead of `localhost`.

## Verification

1. Run project typecheck.
2. Run `runelight check` against the selected scope or a `.g.tsx` file.
3. Start the host dev server.
4. Open `/runelight/studio`.
5. Open `/runelight/studio#/design`.
6. Confirm the manifest contains TypeScript Program `.g.tsx` entries, including design frames from `${project.entryRoot}/design` when present. A setup-only project may legitimately have zero entries; Studio should show its empty state.
7. If at least one `.g.tsx` entry exists, open one `/runelight?...` preview URL.
8. Confirm no `Missing entry`, `Unknown Runelight entry`, or `Unknown Runelight frame` errors.
9. Run `runelight capture` when configured.

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
