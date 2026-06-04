# Next App Router Setup

Set up gtsx in a clean supported Next.js App Router project and verify the resulting user experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing gtsx integration before setup. Do not treat an already-initialized project as proof that setup works.

Validate these outcomes:

- Setup installs/wires the needed gtsx packages, config wrapper, and route files.
- The Next config wrapper uses `gtsxNextReact()` and does not statically import `gtsx.config.ts`.
- `gtsx.config.ts` records `project.sourceRoot` and `project.entryRoot`.
- `${project.entryRoot}/design` exists after setup or dev-server startup.
- The original app route still renders.
- `/gtsx/studio/manifest` returns JSON without a 500.
- `/gtsx/studio` renders Studio and shows discovered component frames.
- `/gtsx?entry=...&frame=...` renders an existing frame.
- While the dev server is running, adding a new `${project.entryRoot}/design/*.g.tsx` frame appears in manifest, Studio, and preview without restarting.
- Editing that design frame updates preview without restarting.
- Removing the temporary design frame does not leave a stale usable preview entry.
- Generated preview entries include source files and `${project.entryRoot}/design`, not guessed `sourceRoot/gtsx/design` paths.
- `/gtsx` and `/gtsx/studio` do not inherit hookful production app layout behavior or trigger app-owned network effects.
- Production `next build` succeeds when `gtsx.config.ts` is missing from the production build context.
- Production `next start` starts successfully without `gtsx.config.ts` or a writable `.gtsx` directory.
- The production app can import and render a normal `.g.tsx` component.
- The original app route returns normally in production, while `/gtsx`, `/gtsx/studio`, and `/gtsx/studio/manifest` are not usable production surfaces unless the project explicitly opts in to production GTSX.
- No `.gtsx/preview-entries.ts` is required or written during production build or production startup.
- In a small focused check, explicitly opting the Next adapter into production preview/studio entries makes the project owner responsible for providing config and generated paths.

Clean up the temporary project, temporary design frame, and generated artifacts created only for this test.
