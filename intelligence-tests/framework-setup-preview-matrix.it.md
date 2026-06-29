# Framework Setup Preview Matrix

Validate the setup playbook across the supported framework profiles by creating temporary projects outside this repository workspace: Vite React, Vite Vue 3, and Next.js App Router. Exercise `installer/runelight-setup.md` from this checkout as the floating setup playbook for each project. Do not treat an already-initialized project as setup proof.

In each project, verify setup before any manual repair:

- The project starts without Runelight project-level skills unless they were already present in the copied fixture.
- Setup installs or wires the needed Runelight packages, including `@runelight/skills`, the framework package, the adapter package, and `@runelight/cli`; it does not add `@runelight/studio`, `@runelight/changes`, legacy preview packages, or removed adapter subpaths as direct dependencies.
- Setup installs or refreshes only the companion skills needed by the detected framework, using this checkout's `skills/` directory for repository/intelligence-test flows and `node_modules/@runelight/skills/` for packaged flows.
- Setup does not install irrelevant framework companion skills, deprecated unsplit skills, `setup-runelight`, or the full Runelight skill set globally.
- Installed companion skills reference `node_modules/@runelight/skills/references/cli.md` for CLI command details instead of carrying duplicated CLI reference files.
- `runelight.config.ts` records `project.sourceRoot`, `project.entryRoot`, and a `host.command` with the `{port}` placeholder.
- `${project.entryRoot}/design` is not created by setup, dev-server startup, preview, or capture.
- The original app route still renders, `/runelight/session` returns serve-session JSON, `runelight preview-targets <entry[#export]> --json` emits browser-ready paths, and an existing `/runelight?...` frame renders.
- While the dev server is running, adding, editing, and removing a source `.g.tsx` or `.g.vue` frame updates preview-target output and preview without restart and leaves no stale usable preview entry after removal.
- In a real git worktree, `runelight changes --json --ui-only` reports added, deleted, and visually changed frames under the configured source root while omitting code-only edits.

Also verify the framework-specific contract in the same temporary projects:

- Vite React uses `runelightViteReact()`, keeps `/runelight/session` in the adapter, gates the browser `/runelight` branch with `__RUNELIGHT_DEV__`, dynamically imports preview modules and `virtual:runelight/preview-config`, uses a static `import.meta.glob` rooted in `project.sourceRoot`, and does not statically import `runelight.config.ts` from `vite.config.*`.
- Vite Vue uses `@vitejs/plugin-vue` with `runelightViteVue()`, mounts `RunelightViteVuePreviewClient` through `@runelight/adapter-vite-vue/preview`, accepts normal `.g.vue` entries with one direct `<g:frames>` block, reports and then clears `uncovered-vue-template-branch`, preserves Vue provide/inject provider axes in `check` and `preview-targets`, renders frame `scope` and `providers` values through native Vue runtime behavior, and does not require app code to import `@runelight/vue/preview`.
- Next App Router uses `runelightNextReact()`, the documented preview and session route helpers, and `createRunelightNextSessionResponse()` from `@runelight/adapter-next-react/session-route` without passing config/cwd/options. It does not import removed subpaths such as `studio-route`, `studio-manifest-route`, or `preview-entries`, and `/runelight` / `/runelight/session` do not inherit hookful production app layout behavior or trigger app-owned network effects.
- Production builds succeed for all three projects. Vite and Next production output can import and render normal `.g.tsx` / `.g.vue` components, does not require `runelight.config.ts` in the production build context, does not expose usable `/runelight` or `/runelight/session` surfaces, and does not require or write `${project.entryRoot}/.runelight` generated files.

Clean up all temporary projects, generated files, serve sessions, browser artifacts, and dev-server processes created for this test.
