# Vite React Setup

Set up Runelight in a clean supported Vite React project and verify the resulting preview/capture experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing Runelight integration before setup. Do not treat an already-initialized project as proof that setup works. Exercise the README installer flow: read `installer/runelight-setup.md` from this checkout as the floating setup playbook, then follow it from the target project.

After the initial setup and preview checks, make the temporary project a git worktree if it is not already one, commit a clean Runelight baseline, then create realistic working-tree `.g.tsx` changes under the configured source root: add a covered component frame, delete a committed covered component frame, make a code-only edit that should not affect visible UI, and modify one component so only one of several frames has a visible change.

Validate these outcomes:

- Before setup runs, the project contains no Runelight project-level skills unless they were already present in the copied fixture.
- Setup installs/wires the needed Runelight packages, Vite adapter, config file, and browser-entry branch. The target project should not add `@runelight/studio` or `@runelight/changes` as direct dependencies.
- Setup installs or refreshes only the React companion skills needed for this project: `authoring-runelight-react`, `refactor-to-runelight-react`, and `polish`.
- Setup does not install `authoring-runelight-vue`, `refactor-to-runelight-vue`, or the deprecated unsplit `authoring-runelight` and `refactor-to-runelight`.
- Setup does not install `setup-runelight` as a project-level skill.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight.config.ts` records `project.sourceRoot`, `project.entryRoot`, and a `host.command` with the `{port}` placeholder that `runelight serve` can wrap.
- `${project.entryRoot}/design` is not created by setup or dev-server startup.
- Vite is configured with `runelightViteReact()` and does not statically import `runelight.config.ts` from `vite.config.*`.
- The browser entry handles only the `/runelight` preview branch; `/runelight/session` is served by the Vite adapter.
- Runelight browser-entry branches are guarded by `__RUNELIGHT_DEV__` and use dynamic imports for preview and `virtual:runelight/preview-config`.
- The preview loader uses `project.sourceRoot` and a static `import.meta.glob` for source `.g.tsx` coverage.
- The original app route still renders.
- `/runelight/session` returns serve-session JSON.
- `/runelight?entry=...&frame=...` renders an existing frame.
- `runelight preview-targets <entry[#export]> --json` returns browser-ready paths for reachable frames.
- While the dev server is running, adding a new source `.g.tsx` frame appears in preview-target output and preview without restarting.
- Editing that added frame updates preview without restarting.
- Removing the temporary frame does not leave a stale usable preview entry.
- `runelight changes --json --ui-only` reports the added frame, deleted frame, and visually changed component with stable component/frame status, but omits the code-only edit from user-visible UI changes.
- For the component with multiple frames, `runelight changes` identifies the changed frame separately from unchanged frames, so the user is not asked to compare two identical previews.
- Setup does not rely on guessed design globs.
- A production `vite build` succeeds when `runelight.config.ts` is missing from the production build context.
- The production app can import and render a normal `.g.tsx` component.
- The production output still renders the original app route and does not require `virtual:runelight/preview-config`, bundle preview route code, expose a usable `/runelight` experience, expose `/runelight/session`, or write `${project.entryRoot}/.runelight` generated files.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, temporary frame, and generated artifacts created only for this test.
