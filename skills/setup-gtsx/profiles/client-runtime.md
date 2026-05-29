# Client Runtime

Use this profile when the host has one browser-owned entry and browser-owned routing. Vite React is the validated profile, but the same contract can be adapted to Vite-powered React Router, TanStack Router SPA, CRA / Webpack, and isolated Electron + Vite renderer projects.

## Contract

1. Add `gtsx.config.ts` with `project.root`, optional `project.tsconfig`, routes, and preview commands.
2. Add a bundler transform so every `.g.tsx` file runs through the gtsx React transform.
3. Expose the project index and resolved config to the browser entry.
4. In the browser entry, branch only on gtsx routes:
   - `/gtsx/studio` renders Studio.
   - `/gtsx` renders preview.
   - Every other route keeps the existing app/router.
5. Load preview components through adapter helpers. Do not hand-roll `entry`, `case`, `gcase`, module key normalization, boundary collection, or iframe protocol.
6. Verify the original app route still renders.

## Host Requirements

This setup path requires:

- A bundler transform hook for `.g.tsx`.
- A safe way to discover preview component modules.
- A browser entry branch that preserves the existing app.
- A dev server command that can bind a deterministic host and port.

When these requirements are present, apply the contract above through the host's existing build and routing conventions.
