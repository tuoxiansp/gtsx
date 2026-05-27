---
name: setup-gtsx
description: Install gtsx Studio into a React project. Detects the TypeScript project and Host (Next.js or Vite), installs packages, wires routes, and verifies the integration end-to-end. Use when a project asks for "install gtsx" or "set up gtsx".
---

# Install gtsx In This Project

Install the smallest working gtsx integration. Stop and ask if the TypeScript project or Host choice is ambiguous. Do not migrate components unless the user explicitly asked.

## Model

- gtsx Project = selected TypeScript project + `.g.tsx` protocol.
- gtsx Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Adapter = package that makes the Host understand gtsx transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.

## Steps

1. Detect package manager and workspace layout.
2. Resolve the TypeScript project:
   - Prefer explicit `-p` / `--project` user input.
   - Otherwise: nearest `tsconfig.json`.
   - Ambiguous → stop and ask.
3. Detect the Host:
   - Next.js React → `@gtsx/adapter-next-react`
   - Vite React → `@gtsx/adapter-vite-react`
   - Ambiguous → stop and ask.
4. Install packages:
   - Always: `gtsx`, `@gtsx/studio`
   - Next React: `@gtsx/adapter-next-react`
   - Vite React: `@gtsx/adapter-vite-react`
   - Never add `@gtsx/preview-react` directly — it is adapter internals.
5. Add scripts:
   - `gtsx:check`: `gtsx check <scope>`
   - `gtsx:serve`: `gtsx serve` (optional)
6. Add Host-local routes:
   - `/gtsx` — preview route
   - `/gtsx/studio` — Studio shell
   - `/gtsx/studio/manifest` — manifest endpoint (if Host supports API routes)

## Studio Integration

- Use `StudioShell` and `createStudioManifest` from `@gtsx/studio`.
- Build manifests with `buildGTSXProjectIndex` or `createCachedGTSXProjectIndexBuilder` from `gtsx/project-index`.
- Manifest entries come only from `.g.tsx` files in the selected TypeScript Program.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## Preview Integration

- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, adapter loading.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, case override merging, or scope fallback logic.
- Import preview clients from framework adapters, not from `@gtsx/preview-react`.

## Next.js React

- Wrap config with `gtsxNextReact` from `@gtsx/adapter-next-react`.
- If the gtsx project is not under `src`, pass `gtsxNextReact({ projectRoot: "<dir>" })`.
- The adapter generates `.gtsx/preview-entries.ts` and wires webpack/Turbopack automatically.
- Client wrapper:

```tsx
"use client"
export { GTSXNextPreviewClient as GTSXPreviewClient } from "@gtsx/adapter-next-react/preview"
```

- `/gtsx` page: read search params and pass `entry`, `caseName`, `chrome`, `sessionId`, `staticMode={searchParams?.static === "1"}` to `GTSXPreviewClient`.

## Vite React

- Configure `gtsxViteReact` from `@gtsx/adapter-vite-react`.
- Preview entry uses `GTSXVitePreviewClient`, `readGTSXPreviewRouteParams`, `parseGTSXPreviewEntry`, `isGTSXPreviewComponent`, and `import.meta.glob<GTSXPreviewModule>("./src/**/*.g.tsx")` from `@gtsx/adapter-vite-react/preview`.
- Keep the route entry thin — no preview runtime logic in the app.

## Verify

1. Run the project typecheck.
2. Run `gtsx check` against the scope or a `.g.tsx` file.
3. Start the Host dev server.
4. Open `/gtsx/studio`.
5. Confirm the manifest contains only TypeScript Program `.g.tsx` entries.
6. Render at least one component card.
7. Open that card's `/gtsx?...` preview URL — confirm no `Missing entry`, `Unknown gtsx entry`, or `Unknown gtsx case` errors.
8. For components with child `.g.tsx` dependencies, confirm root-level Studio shows only top-level components; children are reachable by drilldown.
9. Run capture if configured.

## Report

After completion, tell the user:

- Files changed
- Packages installed
- Selected TypeScript project
- Selected Host
- Verification results
- Any skipped steps
- The Studio URL to open (e.g. `http://localhost:3000/gtsx/studio`)
