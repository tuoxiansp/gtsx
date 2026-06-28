# Client Runtime

Use this profile when a TypeScript React host has one browser-owned entry and browser-owned routing. Vite React is the validated profile, but the same contract can be adapted to Vite-powered React Router, TanStack Router SPA, CRA / Webpack, and isolated Electron + Vite renderer projects.

## Packages

Install:

- `@runelight/core`
- `@runelight/react`
- `@runelight/studio`

Use a validated adapter package when one matches the host. For custom client hosts, build the smallest host adapter on top of `@runelight/react/preview` and `@runelight/studio/static-app`; do not install legacy preview packages.

## Contract

1. Add `runelight.config.ts` with `contracts`, `project.sourceRoot`, `project.entryRoot`, `project.tsconfig`, and a `host.command` that `runelight serve` can wrap.
2. Add a bundler transform so every `.g.tsx` file runs through the Runelight React transform.
3. Expose the project index and resolved config to the preview entry.
4. Create the empty `${project.entryRoot}/design` directory. Do not add a `designRoot` config key or placeholder frames.
5. Serve `/runelight/studio`, `/runelight/studio/assets/*`, and `/runelight/studio/manifest` from the host dev server using `@runelight/studio/static-app` and `createStudioManifestProvider` from `@runelight/studio/manifest-server`.
6. In the browser entry, branch only on `/runelight` for preview. Every other browser route keeps the existing app/router; `/runelight/studio` is served by the host adapter, not rendered by the app entry.
7. Load preview components through adapter helpers, or through `@runelight/react/preview` when writing a custom host adapter. Do not hand-roll preview query parsing, module key normalization, boundary collection, or iframe protocol.
8. In upgrade/ensure mode, do not rewrite existing config, bundler glue, browser-entry branches, or preview helpers if they already pass verification; after package upgrades, migrate only glue proven incompatible by typecheck, adapter contracts, or runtime verification.
9. Verify the original app route still renders.

## Host Requirements

This setup path requires:

- A bundler transform hook for `.g.tsx`.
- A safe way to discover preview component modules.
- A dev server hook that can serve the Studio app, assets, and manifest.
- A browser entry branch for `/runelight` preview that preserves the existing app.
- A dev server command that can bind a deterministic host and accept the `{port}` placeholder, recorded as `host.command`.

When these requirements are present, apply the contract above through the host's existing build and routing conventions.
