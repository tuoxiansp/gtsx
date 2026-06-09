# Next App Router Setup

Set up Runelight in a clean supported Next.js App Router project and verify the resulting user experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing Runelight integration before setup. Do not treat an already-initialized project as proof that setup works. Exercise the README installer flow: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level setup skill.

Validate these outcomes:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup installs/wires the needed Runelight packages, config wrapper, and route files.
- Setup installs or refreshes only the React companion skills needed for this project: `authoring-runelight-react`, `refactor-to-runelight-react`, and `design-runelight-react`.
- Setup does not install `authoring-runelight-vue`, `refactor-to-runelight-vue`, `design-runelight-vue`, or the deprecated unsplit `authoring-runelight`, `refactor-to-runelight`, and `design-runelight`.
- The installed `design-runelight-react/DESIGN_REFERENCE.md` is an aesthetic reference only; it does not contain framework/package installation instructions such as `npm install`, `npx`, or design-stack defaults unrelated to the target project.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- Studio route files call `@runelight/adapter-next-react/studio-route` helpers and do not import React Studio source from `@runelight/studio/client`.
- The Next config wrapper uses `runelightNextReact()` and does not statically import `runelight.config.ts`.
- `runelight.config.ts` records `project.sourceRoot` and `project.entryRoot`.
- `${project.entryRoot}/design` exists after setup or dev-server startup.
- The original app route still renders.
- `/runelight/studio/manifest` returns JSON without a 500.
- `/runelight/studio` renders Studio and shows discovered component frames.
- `/runelight?entry=...&frame=...` renders an existing frame.
- While the dev server is running, adding a new `${project.entryRoot}/design/*.g.tsx` frame appears in manifest, Studio, and preview without restarting.
- Editing that design frame updates preview without restarting.
- Removing the temporary design frame does not leave a stale usable preview entry.
- Generated preview entries include source files and `${project.entryRoot}/design`, not guessed `sourceRoot/runelight/design` paths.
- `/runelight` and `/runelight/studio` do not inherit hookful production app layout behavior or trigger app-owned network effects.
- Production `next build` succeeds when `runelight.config.ts` is missing from the production build context.
- Production `next start` starts successfully without `runelight.config.ts` or a writable `.runelight` directory.
- The production app can import and render a normal `.g.tsx` component.
- The original app route returns normally in production, while `/runelight`, `/runelight/studio`, and `/runelight/studio/manifest` are not usable production surfaces unless the project explicitly opts in to production Runelight.
- No `.runelight/preview-entries.ts` is required or written during production build or production startup.
- After explicitly opting the project into production Runelight, for example by setting `studio.exposeInProduction: true` in `runelight.config.ts` and enabling the generated Next Studio/preview route helpers for production, a production `next build` and `next start` should expose usable `/runelight`, `/runelight/studio`, and `/runelight/studio/manifest` routes. Studio should discover frames and render preview iframes from the production server. Removing the opt-in should restore the default non-exposed production behavior.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, temporary design frame, and generated artifacts created only for this test.
