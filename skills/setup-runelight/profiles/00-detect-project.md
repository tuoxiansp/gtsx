# Project Detection

Read this before choosing an integration profile.

## Model

- Runelight Project = selected TypeScript project + `.g` protocol files.
- Runelight Scope = `.g.tsx` or `.g.vue` files in the selected TypeScript project and configured source roots.
- Host = framework/runtime that renders that scope.
- Host topology = client-only React, client+server React, or client-only Vue.
- Adapter = package that makes the Host understand Runelight transforms and preview URLs.
- Source discovery follows the selected TypeScript project plus configured source roots. Host setup does not widen the source scope accidentally.
- Validated profile = a tested framework-specific integration path. Validated profiles are Vite React, Vite Vue, and Next.js App Router.
- Integration contract = framework-neutral wiring to adapt when no validated profile exists.

## Required Contract

Every successful integration needs:

1. TypeScript Program and source-root scope for `.g.tsx` or `.g.vue` discovery.
2. React or Vue transform for component boundaries.
3. Project index / manifest built from the selected source set.
4. Preview route that maps `entry`, `frame`, and `frameOverride` search params to the preview client.
5. Studio route that serves the prebuilt `@runelight/studio` app and manifest.
6. A `host.command` in `runelight.config.ts` so `runelight serve` and `runelight capture` can manage the Host lifecycle for verification and capture.

## Supported Project Scope

The setup-runelight skill supports TypeScript React projects and TypeScript Vue 3 projects. A supported project has:

- A TypeScript Program that includes framework source and can include `.g.tsx` or `.g.vue` files.
- A React or Vue host with a browser entry or framework routes.
- A bundler/framework hook where protocol files can run through the matching Runelight transform.

JavaScript-only projects, unsupported framework hosts, and projects without a selectable TypeScript Program are outside the setup-runelight scope.

## Detection Steps

1. Detect package manager and workspace layout.
2. Resolve the TypeScript project:
   - Prefer explicit `-p` / `--project` user input.
   - Otherwise use the nearest `tsconfig.json`.
   - If the nearest `tsconfig.json` is a project-reference container with `files: []`, choose the app config that includes framework source, such as `tsconfig.app.json` in create-vite templates.
3. Detect host topology:
   - Browser-owned entry and browser-owned routing -> client-only React.
   - Vite + Vue 3 browser entry -> client-only Vue.
   - Server routes, SSR, static route generation, framework route files, or islands -> client+server React.
4. Select the most specific integration profile:
   - Vite React before client runtime.
   - Vite Vue before client runtime.
   - Next.js App Router before server runtime.
   - Client Runtime for client-only React hosts such as CRA/Webpack, Vite-compatible SPA variants, and isolated Electron renderers.
   - Server Runtime for server/static/islands hosts such as Next.js Pages Router, Remix / React Router framework mode, TanStack Start, Astro, and Gatsby.

## Existing Integration Detection

Before selecting write actions, check whether the project is already integrated:

- Runelight packages in dependencies or devDependencies.
- `runelight.config.ts`.
- Adapter wrappers in `vite.config.*`, `next.config.*`, or another framework config.
- Existing `/runelight`, `/runelight/studio`, `/runelight/studio/assets/*`, or `/runelight/studio/manifest` route files or browser-entry branches.
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
- Install `@runelight/adapter-vite-react` only for Vite-compatible React client-only hosts.
- Install `@runelight/adapter-vite-vue` only for Vite Vue 3 client-only hosts.
- Install `@runelight/adapter-next-react` only for Next.js App Router.
- Put selected source root, selected local Runelight entry root, selected tsconfig, stable cache namespace, and the Host dev command in `runelight.config.ts`. The valid keys are `project.{sourceRoot, entryRoot, namespace, tsconfig}`, `host.command`, and `studio.{exposeInProduction, manifestCacheTtlMs}`; routes are fixed at `/runelight`, `/runelight/studio`, and `/runelight/studio/manifest` and are not configurable.
- Use the package name or repo slug as `project.namespace`, not a file hash.
- Choose `project.sourceRoot: "src"` when app source lives under `src`; choose `project.sourceRoot: "."` for root-level `app`, `pages`, `components`, or `lib`.
- Choose `project.entryRoot` as the filesystem directory that owns the local `/runelight` entry: usually `app/runelight`, or `src/app/runelight` when the route tree lives under `src/app`. For client-only hosts without filesystem routes, still create and record a logical entry root during setup: `app/runelight` at the project root by default, or `src/app/runelight` when the project keeps all authored source under `src`.
- Generate `host.command` for the detected package manager and host using its exec form (`npx vite ...`, `pnpm exec next dev ...`). Do not hard-code `pnpm` in npm/yarn/bun projects, and do not point `host.command` at a package script that itself runs `runelight serve`.
- `host.command` must bind a deterministic host (prefer `127.0.0.1`) and accept the `{port}` placeholder; `runelight serve` substitutes the Runelight-owned port and prints the serve and Studio URLs itself.

## Verification

1. Run project typecheck.
2. Run `runelight check` against the selected source root, a `.g.tsx` file, or a `.g.vue` file.
3. Start the host dev server through `runelight serve` (or the package script that wraps it).
4. Open `/runelight/studio`.
5. Open `/runelight/studio#/design`.
6. Confirm the manifest contains `.g.tsx` or `.g.vue` entries, including design frames from `${project.entryRoot}/design` when present. A setup-only project may legitimately have zero entries; Studio should show its empty state.
7. If at least one protocol entry exists, open one `/runelight?...` preview URL.
8. Confirm no `Missing entry`, `Unknown Runelight entry`, or `Unknown Runelight frame` errors.
9. Run `runelight capture` against one entry when at least one protocol entry exists.

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
