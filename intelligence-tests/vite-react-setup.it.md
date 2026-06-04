# Vite React Setup

Set up gtsx in a clean supported Vite React project and verify the resulting user experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing gtsx integration before setup. Do not treat an already-initialized project as proof that setup works.

Validate these outcomes:

- Setup installs/wires the needed gtsx packages, Vite adapter, config file, and browser-entry branch.
- `gtsx.config.ts` records `project.sourceRoot` and `project.entryRoot`.
- `${project.entryRoot}/design` exists after setup or dev-server startup.
- Vite is configured with `gtsxViteReact()` and does not statically import `gtsx.config.ts` from `vite.config.*`.
- GTSX browser-entry branches are guarded by `import.meta.env.DEV` and use dynamic imports for Studio, preview, and `virtual:gtsx/*`.
- The preview loader uses `project.sourceRoot` and a static `import.meta.glob` for `${project.entryRoot}/design/**/*.g.tsx`.
- The original app route still renders.
- `/gtsx/studio` renders Studio and shows discovered component frames.
- `/gtsx?entry=...&frame=...` renders an existing frame.
- While the dev server is running, adding a new `${project.entryRoot}/design/*.g.tsx` frame appears in Studio and preview without restarting.
- Editing that design frame updates preview without restarting.
- Removing the temporary design frame does not leave a stale usable preview entry.
- Design files live under `${project.entryRoot}/design`, never under `.gtsx`.
- Setup does not rely on multiple guessed design globs.
- A production `vite build` succeeds when `gtsx.config.ts` is missing from the production build context.
- The production app can import and render a normal `.g.tsx` component.
- The production output still renders the original app route and does not require `virtual:gtsx/*`, bundle Studio/preview route code, expose a usable `/gtsx` experience, or write `.gtsx`/GTSX-generated preview registry files.

Clean up the temporary project, temporary design frame, and generated artifacts created only for this test.
