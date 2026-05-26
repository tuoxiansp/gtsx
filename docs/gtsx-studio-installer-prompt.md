# GTSX Studio Installer Prompt

This is the canonical installation entrypoint for GTSX.

GTSX does not provide a `gtsx init` command. Install GTSX by giving this prompt to an AI coding agent inside the target repository. The agent should inspect the selected TypeScript project, detect or ask about the Host, apply the smallest project-local integration, and verify Studio, preview, and capture behavior.

You are integrating GTSX Studio into this repository. Treat GTSX as a TypeScript project companion, not as an app/library/framework classifier.

The setup model is:

```txt
GTSX Project = selected TypeScript project + .g.tsx protocol
GTSX Scope = .g.tsx files in the selected TypeScript Program
Host = execution environment that renders that scope
Adapter = bridge that makes the Host understand GTSX boundaries and preview URLs
```

The invariant is:

> Scope follows TypeScript. Host does not expand scope.

## Setup Flow

1. Detect the package manager and workspace layout.
2. Resolve the selected TypeScript project:
   - Prefer an explicit user-provided `-p` / `--project` path.
   - Otherwise use the nearest `tsconfig.json`.
   - If the repository root is a solution config with references, identify the referenced projects and ask which one to integrate unless the user's intent is clear.
3. Derive GTSX Scope from the selected TypeScript Program. Do not reimplement `include` / `exclude` as raw glob logic. Follow TypeScript semantics and then filter for `.g.tsx`.
4. Check whether a usable Host already exists.
5. If a Host exists, create thin Host-local Studio and preview routes.
6. If no Host exists, configure a managed GTSX Host or ask the user to choose an external Host.
7. Install the smallest useful adapter/host package set.
8. Add local scripts and GTSX instructions.
9. Verify typecheck, manifest, Studio, preview, and capture where practical.

## Host Contract

Install or configure these development routes in the selected Host:

- `/gtsx`: lightweight preview route for rendering GTSX component cases in an iframe.
- `/gtsx/studio`: Studio shell route.
- `/gtsx/studio/manifest`: Studio manifest route when the Host supports an API or server route.

The Studio shell route should import `StudioShell` and `createStudioManifest` from `@gtsx/studio`. When a Host needs to build a manifest on the server, compose `buildGTSXProjectIndex` from `gtsx/project-index` with `createStudioManifest`.

The Host may import CSS, setup files, providers, mocks, app shells, aliases, and other dependencies needed for rendering. Those imports do not expand the GTSX Scope. Studio entries come only from `.g.tsx` files in the selected TypeScript Program.

For Next.js Hosts using `@gtsx/adapter-next-react`, do not hand-maintain a `previewEntries` object. The adapter generates a lazy module registry at `.gtsx/preview-entries.ts` and aliases `@gtsx/adapter-next-react/preview-entries` to it. The `/gtsx` preview route should import `loadGTSXPreviewComponent` from that module and load only the requested `entry`. If the selected GTSX project is not under `src`, pass `projectRoot` to `gtsxNextReact({ projectRoot: "components" })`.

## Manifest Provider Preference

Prefer project index providers in this order:

1. Host-local API or server route.
2. Adapter-provided `virtual:gtsx/project-index` module.
3. Managed Host provider.

For Hosts with server routes, create a thin `/gtsx/studio/manifest` endpoint that returns the static manifest for the selected GTSX Project.

Use a virtual project-index module only when the adapter-supported Host cannot expose a Host-local server/API route. The Studio Host should turn that project index into a manifest with `createStudioManifest`.

Do not create a public manifest watcher fallback for the MVP. Do not write runtime props, scope, provider values, DOM rects, or serialized runtime snapshots into a public file.

## Verification

After installing or configuring the Host:

1. Run the selected TypeScript project's typecheck.
2. Run `gtsx check -p <project>` against at least one `.g.tsx` file or scope directory.
3. Open Studio at `/gtsx/studio`.
4. Confirm the manifest provider returns component entries from the selected GTSX Scope.
5. Open Studio and render at least one component card.
6. Open the card's preview URL and confirm `/gtsx` renders the selected case.
7. Run a capture command when browser capture is configured.

If multiple TypeScript projects or multiple plausible Hosts are detected, stop and ask the user to choose. Do not guess by app/library/package shape.
