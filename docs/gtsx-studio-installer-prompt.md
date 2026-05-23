# GTSX Studio Installer Prompt

You are integrating GTSX Studio into this project. Detect the framework and create thin project-local routes that delegate to official GTSX helpers instead of copying Studio implementation code.

## Route Contract

Install these development routes:

- `/gtsx`: lightweight preview route for rendering GTSX component cases in an iframe.
- `/gtsx/studio`: Studio shell route.
- `/gtsx/studio/manifest`: Studio manifest route.

The Studio shell route should import `StudioShell` from `gtsx/studio/client`. The manifest route should import `buildStudioManifest` from `gtsx/studio/server`.

## Manifest Provider Preference

Prefer a server/API route manifest provider. For frameworks with server routes, create a thin `/gtsx/studio/manifest` endpoint that returns `buildStudioManifest({ cwd, projectRoot })` as JSON.

Use a virtual module fallback only when the adapter-supported stack cannot expose a project-local server/API route. The virtual module fallback must return the same static manifest shape as the server/API route manifest provider.

Do not create a public manifest watcher fallback for the MVP. Do not write runtime props, scope, provider values, DOM rects, or serialized runtime snapshots into a public file.

## Verification

After installing routes:

1. Run the project's typecheck.
2. Open Studio at `/gtsx/studio`.
3. Confirm the manifest endpoint at `/gtsx/studio/manifest` returns component entries.
4. Open Studio and render at least one component card.
5. Open the card's preview URL and confirm `/gtsx` renders the selected case.
