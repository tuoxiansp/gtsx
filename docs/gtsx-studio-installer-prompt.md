# GTSX Studio Installer Prompt

Copy everything inside this block into the target repository and give it to an AI coding agent.

````md
Install GTSX Studio in this repository. Make the smallest working integration, verify it, and stop if the TypeScript project or Host choice is ambiguous. Do not migrate components unless the user explicitly asked for migration.

First, install/load the GTSX skills:

- `authoring-gtsx` from the GTSX repo/package `skill/authoring-gtsx` directory.
- `refactor-to-gtsx` from the GTSX repo/package `skill/refactor-to-gtsx` directory.
- If this agent runtime cannot install skills, read both `SKILL.md` files and follow them as mandatory instructions.

Model and invariant:

- GTSX Project = selected TypeScript project + `.g.tsx` protocol.
- GTSX Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Adapter = package that makes the Host understand GTSX transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.

Do this:

1. Detect package manager and workspace layout.
2. Resolve the selected TypeScript project.
   - Prefer explicit `-p` / `--project` user input.
   - Otherwise use the nearest `tsconfig.json`.
   - If multiple TS projects are plausible, stop and ask.
3. Detect the Host.
   - Existing Next.js React Host: use `@gtsx/adapter-next-react`.
   - Existing Vite React Host: use `@gtsx/adapter-vite-react`.
   - If multiple Hosts are plausible, stop and ask.
4. Install only needed packages.
   - Always: `gtsx`, `@gtsx/studio`.
   - Next React: `@gtsx/adapter-next-react`.
   - Vite React: `@gtsx/adapter-vite-react`.
   - Do not add `@gtsx/preview-react` directly to an app; it is adapter/core internals.
5. Add scripts:
   - `gtsx:check`: `gtsx check <selected-scope-or-file>`
   - optional `gtsx:serve`: `gtsx serve`
6. Add thin Host-local routes:
   - `/gtsx`: preview route.
   - `/gtsx/studio`: Studio shell.
   - `/gtsx/studio/manifest`: manifest route if the Host supports server/API routes.

Studio rules:

- Use `StudioShell` and `createStudioManifest` from `@gtsx/studio`.
- Build the manifest with `buildGTSXProjectIndex` or `createCachedGTSXProjectIndexBuilder` from `gtsx/project-index`.
- Manifest entries must come only from `.g.tsx` files in the selected TypeScript Program.
- Do not write runtime props, scope, provider values, DOM rects, or serialized runtime snapshots into public files.

Preview rules:

- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, and adapter-specific loading.
- Do not reimplement preview runtime in the app. Do not create `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, case override merging, or scope fallback logic.
- Import preview clients from framework adapters, not from `@gtsx/preview-react`.

Next.js React:

- Wrap config with `gtsxNextReact` from `@gtsx/adapter-next-react`.
- If the GTSX project is not under `src`, pass `gtsxNextReact({ projectRoot: "<dir>" })`.
- Do not hand-maintain preview registries or aliases. The adapter generates `.gtsx/preview-entries.ts` and wires webpack/Turbopack.
- Client wrapper:

```tsx
"use client"
export { GTSXNextPreviewClient as GTSXPreviewClient } from "@gtsx/adapter-next-react/preview"
```

- `/gtsx` page: read framework search params and pass only `entry`, `caseName`, `chrome`, `sessionId`, and `staticMode={searchParams?.static === "1"}` to `GTSXPreviewClient`.

Vite React:

- Configure `gtsxViteReact` from `@gtsx/adapter-vite-react`.
- Preview entry uses `GTSXVitePreviewClient`, `readGTSXPreviewRouteParams`, `parseGTSXPreviewEntry`, `isGTSXPreviewComponent`, and an `import.meta.glob<GTSXPreviewModule>("./src/**/*.g.tsx")` loader from `@gtsx/adapter-vite-react/preview`.
- Keep the route entry thin; no preview runtime logic belongs in the app.

Verify:

1. Run the target project's typecheck.
2. Run `gtsx check` against the selected scope or at least one `.g.tsx` file.
3. Start the Host dev server.
4. Open `/gtsx/studio`.
5. Confirm the manifest contains only selected TypeScript Program `.g.tsx` entries.
6. Render at least one component card.
7. Open that card's `/gtsx?...` preview URL and confirm it does not show `Missing entry`, `Unknown GTSX entry`, or `Unknown GTSX case`.
8. For a component with child `.g.tsx` dependencies, confirm root-level Studio shows only components not referenced by other `.g.tsx` components; referenced children should be reachable by drilldown.
9. Run capture if browser capture is configured.

Report files changed, packages installed, selected TypeScript project, selected Host, verification results, and any skipped verification.
````
