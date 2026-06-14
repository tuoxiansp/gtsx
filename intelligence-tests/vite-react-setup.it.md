# Vite React Setup

Set up Runelight in a clean supported Vite React project and verify the resulting user experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing Runelight integration before setup. Do not treat an already-initialized project as proof that setup works. Exercise the README installer flow: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level setup skill.

After the initial setup and preview checks, make the temporary project a git worktree if it is not already one, commit a clean Runelight baseline, then create realistic working-tree `.g.tsx` changes: add a design frame, delete a committed design frame, make a code-only edit that should not affect visible UI, and modify one component so only one of several frames has a visible change.

Validate these outcomes:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup installs/wires the needed Runelight packages, Vite adapter, config file, and browser-entry branch.
- Setup installs or refreshes only the React companion skills needed for this project: `authoring-runelight-react`, `refactor-to-runelight-react`, and `design-runelight-react`.
- Setup does not install `authoring-runelight-vue`, `refactor-to-runelight-vue`, `design-runelight-vue`, or the deprecated unsplit `authoring-runelight`, `refactor-to-runelight`, and `design-runelight`.
- The installed `design-runelight-react/DESIGN_REFERENCE.md` is an aesthetic reference only; it does not contain framework/package installation instructions such as `npm install`, `npx`, or design-stack defaults unrelated to the target project.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight.config.ts` records `project.sourceRoot`, `project.entryRoot`, and a `host.command` with the `{port}` placeholder that `runelight serve` can wrap.
- `${project.entryRoot}/design` exists after setup or dev-server startup.
- Vite is configured with `runelightViteReact()` and does not statically import `runelight.config.ts` from `vite.config.*`.
- The browser entry handles only the `/runelight` preview branch; Studio is served by the Vite adapter as a prebuilt app from the same dev server.
- Runelight browser-entry branches are guarded by `__RUNELIGHT_DEV__` and use dynamic imports for preview and `virtual:runelight/preview-config`.
- The preview loader uses `project.sourceRoot` and a static `import.meta.glob` for `${project.entryRoot}/design/**/*.g.tsx`.
- The original app route still renders.
- `/runelight/studio` renders Studio and shows discovered component frames.
- `/runelight?entry=...&frame=...` renders an existing frame.
- While the dev server is running, adding a new `${project.entryRoot}/design/*.g.tsx` frame appears in Studio and preview without restarting.
- Editing that design frame updates preview without restarting.
- Removing the temporary design frame does not leave a stale usable preview entry.
- `runelight changes --json --ui-only` reports the added design frame, deleted design frame, and visually changed component with stable component/frame status, but omits the code-only edit from user-visible UI changes.
- In the changed git worktree, opening Studio defaults to the Changes workspace; in a clean worktree, Studio defaults to Frames.
- The Studio Changes workspace renders added, deleted, and modified Runelight surfaces without empty before/current boxes. Deleted items have a visibly disabled/deleted presentation, added items show only current UI, and modified items show before/current only where comparison is meaningful.
- For the component with multiple frames, both Studio Changes and `runelight changes` identify the changed frame separately from unchanged frames, so the user is not asked to compare two identical previews.
- Selecting a non-first change item stays selected while previews load, and switching between Changes, Frames, and Drafts does not leave either workspace permanently blank.
- Design files live under `${project.entryRoot}/design`, never under `${project.entryRoot}/.runelight`.
- Setup does not rely on multiple guessed design globs.
- A production `vite build` succeeds when `runelight.config.ts` is missing from the production build context.
- The production app can import and render a normal `.g.tsx` component.
- The production output still renders the original app route and does not require `virtual:runelight/preview-config`, bundle preview route code, expose a usable `/runelight` experience, or write `${project.entryRoot}/.runelight` generated files.
- In a controlled fixture that uses the repository's internal production opt-in hook, a production `vite build` emits a usable `/runelight/` preview entry, `/runelight/studio/` Studio entry, `/runelight/studio/manifest`, and Studio assets without platform-specific rewrites. Serving the built output should allow Studio to discover frames and render preview iframes from the production bundle. Removing the opt-in should restore the default non-exposed production output. Do not turn this fixture-only hook into user-facing setup guidance.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, temporary design frame, and generated artifacts created only for this test.
