# Client Runtime

Use this profile when a TypeScript React host has one browser-owned entry and browser-owned routing. Vite React is the validated profile, but the same contract can be adapted to Vite-powered React Router, TanStack Router SPA, CRA / Webpack, and isolated Electron + Vite renderer projects.

## Contract

1. Add `runelight.config.ts` with `project.sourceRoot`, `project.entryRoot`, `project.tsconfig`, and `host.command`.
2. Add a bundler transform so every `.g.tsx` file runs through the Runelight React transform.
3. Expose the project index and resolved config to the browser entry.
4. Create the empty `${project.entryRoot}/design` directory. Do not add a `designRoot` config key or placeholder frames.
5. In the browser entry, branch only on the `/runelight` preview path. Studio (`/runelight/studio`, `/runelight/studio/manifest`, `/runelight/studio/assets/*`) is served by the adapter or framework route helpers — not by the browser entry.
6. Load preview components through adapter helpers. Do not hand-roll `entry`, `frame`, `frameOverride`, module key normalization, boundary collection, or iframe protocol.
7. In upgrade/ensure mode, do not rewrite existing config, bundler glue, browser-entry branches, or preview helpers if they already pass verification; after package upgrades, migrate only glue proven incompatible by typecheck, adapter contracts, or runtime verification.
8. Verify the original app route still renders.

## Host Requirements

This setup path requires:

- A bundler transform hook for `.g.tsx`.
- A safe way to discover preview component modules.
- A browser entry branch that preserves the existing app.
- A dev server command that can bind a deterministic host and port through `host.command`.

When these requirements are present, apply the contract above through the host's existing build and routing conventions.
