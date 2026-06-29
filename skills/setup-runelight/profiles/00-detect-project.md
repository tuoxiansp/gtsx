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
3. Static project index built from the selected source set.
4. Preview route that delegates Runelight preview query parsing and rendering to the selected adapter or adapter runtime helper.
5. Session route that returns the Runelight serve-session identity.
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
- Existing `/runelight` or `/runelight/session` route files, middleware handlers, or `/runelight` browser-entry branches.
- Existing adapter-generated output under `${project.entryRoot}/.runelight/`.

If any of these are present, classify the task as upgrade/ensure mode unless the user explicitly asked for a full reinstall. In upgrade/ensure mode:

- Update Runelight packages, then audit whether the existing glue still matches the upgraded package contracts.
- Preserve existing route files, config wrappers, browser-entry branches, URL conventions, preview commands, and local customizations.
- Change glue only when typecheck, adapter exports/types, package examples/docs, generated-file errors, or runtime verification show that a version migration is required.
- If the adapter package or wrapper must change, preserve the existing wrapper composition order and explain the change.
- Ensure `runelight.config.ts` records `project.entryRoot`.
- Verify the integration and report which existing glue files were intentionally left unchanged.

## Common Configuration Rules

- Always install `@runelight/core` and the selected framework package (`@runelight/react` for React, `@runelight/vue` for Vue).
- Install `@runelight/adapter-vite-react` only for Vite-compatible React client-only hosts.
- Install `@runelight/adapter-vite-vue` only for Vite Vue 3 client-only hosts.
- Install `@runelight/adapter-next-react` only for Next.js App Router.
- Put selected framework contract, selected source root, selected local Runelight entry root, selected tsconfig when needed, and the Host dev command in `runelight.config.ts`. The valid keys are `contracts`, `project.{sourceRoot, entryRoot, namespace, tsconfig}` and `host.command`; user-facing routes are fixed and not configurable: `/runelight` and `/runelight/session`.
- Ensure the project `.gitignore` contains `.runelight/`. Do not add a path-specialized ignore rule such as `${project.entryRoot}/.runelight/`; `.runelight/` covers generated Runelight directories at any depth. Project-local generated Runelight files live under `${project.entryRoot}/.runelight/`; choose `project.entryRoot` inside the app's authored source tree so generated files stay source-scoped and importable without user glue.
- `project.namespace` is optional. When a stable package name or repo slug is available, use it as `project.namespace`; do not invent a file hash or derive it from a transient folder name.
- Choose `project.sourceRoot: "src"` when app source lives under `src`; choose `project.sourceRoot: "."` for root-level `app`, `pages`, `components`, or `lib`.
- Choose `project.entryRoot` as the filesystem directory that owns the local `/runelight` entry: use `src/app/runelight` when the project keeps authored source under `src`, or `app/runelight` for root-level source projects. Because generated files are derived under `${project.entryRoot}/.runelight/`, keep this entry root inside the source tree the host can import. For client-only hosts without filesystem routes, still create and record this logical entry root during setup.
- Generate `host.command` for the detected package manager and host using its exec form (`npx vite ...`, `pnpm exec next dev ...`). Do not hard-code `pnpm` in npm/yarn/bun projects, and do not point `host.command` at a package script that itself runs `runelight serve`.
- `host.command` must bind a deterministic host (prefer `127.0.0.1`) and accept the `{port}` placeholder; `runelight serve` substitutes the Runelight-owned port, waits for `/runelight/session`, and prints the serve URL plus the base `/runelight` preview URL itself.

## Verification

1. Run project typecheck.
2. Run `runelight check` for the configured project. Use an explicit `.g.tsx` / `.g.vue` file only when narrowing a failing diagnostic.
3. Start the host dev server through `runelight serve` (or the package script that wraps it).
4. Open `/runelight/session`.
5. If at least one protocol entry exists, run `runelight preview-targets --json <entry[#export]>` and open one `/runelight?...` preview URL.
6. Confirm no `Missing entry`, `Unknown Runelight entry`, or `Unknown Runelight frame` errors.
7. Run `runelight capture <entry[#export]>` against one concrete entry when at least one protocol entry exists.

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
- The preview URL or capture command used for verification
