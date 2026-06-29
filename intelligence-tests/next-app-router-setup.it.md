# Next App Router Setup

Set up Runelight in a clean supported Next.js App Router project and verify the resulting preview/capture experience.

Use a fresh/minimal project, or make a temporary copy of another project and remove any existing Runelight integration before setup. Do not treat an already-initialized project as proof that setup works. Exercise the README installer flow: read `installer/runelight-setup.md` from this checkout as the floating setup playbook, then follow it from the target project.

After the setup and preview checks, make the temporary project a git worktree if needed, commit a clean Runelight baseline, and create at least one added, one deleted, and one modified `.g.tsx` working-tree change under the configured source root.

Validate these outcomes:

- Before setup runs, the project contains no Runelight project-level skills unless they were already present in the copied fixture.
- Setup installs/wires the needed Runelight packages, including `@runelight/skills`, config wrapper, preview route, and session route. The target project should not add `@runelight/studio` or `@runelight/changes` as direct dependencies.
- Setup installs or refreshes only the React companion skills needed for this project: `authoring-runelight-react`, `refactor-to-runelight-react`, and `polish`, using this checkout's `skills/` directory for repository/intelligence-test flows and `node_modules/@runelight/skills/` for packaged flows.
- Setup does not install `authoring-runelight-vue`, `refactor-to-runelight-vue`, or the deprecated unsplit `authoring-runelight` and `refactor-to-runelight`.
- Setup does not install `setup-runelight` as a project-level skill.
- Installed companion skills reference `node_modules/@runelight/skills/references/cli.md` for CLI command details instead of carrying duplicated CLI reference files in each copied skill directory.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- The preview route uses the documented Next preview helpers, the session route calls `createRunelightNextSessionResponse()` from `@runelight/adapter-next-react/session-route` without passing config/cwd/options, and app code does not import adapter internals outside the documented preview/session helpers.
- The target project does not import removed Next adapter subpaths such as `@runelight/adapter-next-react/studio-route`, `@runelight/adapter-next-react/studio-manifest-route`, or `@runelight/adapter-next-react/preview-entries`.
- The Next config wrapper uses `runelightNextReact()` and does not statically import `runelight.config.ts`.
- `runelight.config.ts` records `project.sourceRoot`, `project.entryRoot`, and a `host.command` with the `{port}` placeholder that `runelight serve` can wrap.
- `${project.entryRoot}/design` is not created by setup or dev-server startup.
- The original app route still renders.
- `/runelight/session` returns serve-session JSON.
- `/runelight?entry=...&frame=...` renders an existing frame.
- `runelight preview-targets <entry[#export]> --json` returns browser-ready paths for reachable frames.
- While the dev server is running, adding a new source `.g.tsx` frame appears in preview-target output and preview without restarting.
- Editing that added frame updates preview without restarting.
- Removing the temporary frame does not leave a stale usable preview entry.
- `runelight changes --json --ui-only` reports added, deleted, and modified Runelight surfaces using the configured `project.sourceRoot` rather than guessed paths.
- Generated Runelight dev preview wiring uses source files from the configured source root, not guessed or special-case preview roots.
- `/runelight` and `/runelight/session` do not inherit hookful production app layout behavior or trigger app-owned network effects.
- Production `next build` succeeds when `runelight.config.ts` is missing from the production build context.
- Production `next start` starts successfully without `runelight.config.ts` or a writable `${project.entryRoot}/.runelight` directory.
- The production app can import and render a normal `.g.tsx` component.
- The original app route returns normally in production, while `/runelight` and `/runelight/session` are not usable production surfaces.
- No generated files under `${project.entryRoot}/.runelight/` are required or written during production build or production startup.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, temporary frame, and generated artifacts created only for this test.
