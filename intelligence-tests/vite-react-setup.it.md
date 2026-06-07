# Vite React Setup

Set up Runelight in a clean supported Vite React project and verify the resulting user experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing Runelight integration before setup. Do not treat an already-initialized project as proof that setup works. Exercise the README installer flow: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level setup skill.

Validate these outcomes:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup installs/wires the needed Runelight packages, Vite adapter, config file, and browser-entry branch.
- Setup installs or refreshes only the React companion skills needed for this project: `authoring-runelight-react`, `refactor-to-runelight`, and `design-runelight`.
- Setup does not install `authoring-runelight-vue` or the deprecated unsplit `authoring-runelight`.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight.config.ts` records `project.sourceRoot` and `project.entryRoot`.
- `${project.entryRoot}/design` exists after setup or dev-server startup.
- Vite is configured with `runelightViteReact()` and does not statically import `runelight.config.ts` from `vite.config.*`.
- The browser entry handles only the `/runelight` preview branch; Studio is served by the Vite adapter as a prebuilt app from the same dev server.
- Runelight browser-entry branches are guarded by `import.meta.env.DEV` and use dynamic imports for preview and `virtual:runelight/*`.
- The preview loader uses `project.sourceRoot` and a static `import.meta.glob` for `${project.entryRoot}/design/**/*.g.tsx`.
- The original app route still renders.
- `/runelight/studio` renders Studio and shows discovered component frames.
- `/runelight?entry=...&frame=...` renders an existing frame.
- While the dev server is running, adding a new `${project.entryRoot}/design/*.g.tsx` frame appears in Studio and preview without restarting.
- Editing that design frame updates preview without restarting.
- Removing the temporary design frame does not leave a stale usable preview entry.
- Design files live under `${project.entryRoot}/design`, never under `.runelight`.
- Setup does not rely on multiple guessed design globs.
- A production `vite build` succeeds when `runelight.config.ts` is missing from the production build context.
- The production app can import and render a normal `.g.tsx` component.
- The production output still renders the original app route and does not require `virtual:runelight/*`, bundle preview route code, expose a usable `/runelight` experience, or write `.runelight`/Runelight-generated preview registry files.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, temporary design frame, and generated artifacts created only for this test.
