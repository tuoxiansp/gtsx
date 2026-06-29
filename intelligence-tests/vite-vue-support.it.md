# Vite Vue Support

Validate Runelight's Vue support in a fresh Vite Vue project.

Create a temporary Vite Vue 3 app outside the repository workspace. Exercise the README installer flow: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level setup skill. Setup should wire the local Runelight packages from this checkout, configure Vite with `@vitejs/plugin-vue` and `runelightViteVue()`, add `runelight.config.ts` with `project.sourceRoot`, `project.entryRoot`, and a `host.command` that `runelight serve` can wrap, and add a development-only `/runelight` branch that mounts `RunelightViteVuePreviewClient` with `createRunelightViteVuePreviewComponentLoader`.

Add at least one `.g.vue` component under the selected source root. The file must use a normal Vue `<template>`, a normal `<script setup lang="ts">`, and a single direct `<g:frames>` block whose content is `export default { ... }`. Do not use nested `<g:frame>` tags. Include at least two frames where `props` and `scope` drive visible template branches.

Add a Vue template reachability target. Start with a `.g.vue` component whose template has a structural branch that is not covered by any frame, such as a `v-if` / `v-else-if` branch, a visible `v-show` branch, a non-empty `v-for` branch, or a dynamic component `:is` branch. Confirm `runelight check` reports `uncovered-vue-template-branch` for that component. Then add the missing static frame value and confirm the same check passes.

Also add a Vue-native provide/inject case in the same temporary project. Define an injection key in a normal TypeScript module with `defineGInjectionKey<{ role: "admin" | "viewer" }>({ variants: ["admin", "viewer"] as const })`. Have a `.g.vue` component import that key, call Vue's native `inject(key)` in `<script setup>`, and render the injected role in the template. Its `<g:frames lang="ts">` block must import the same key, use frame `providers: [[key, value]]` entries, and mark coverage with `GVueProviderFrame` / `GVueFrames`.

After the Vue setup and preview checks, make the temporary project a git worktree if needed, commit a clean Runelight baseline, then create added, deleted, modified, and code-only `.g.vue` working-tree changes under the configured source root.

Validate these outcomes:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup installs/wires the needed Runelight packages and does not add `@runelight/studio` or `@runelight/changes` as direct dependencies.
- Setup installs or refreshes only the Vue companion skills needed for this project: `authoring-runelight-vue`, `refactor-to-runelight-vue`, and `polish`.
- Setup does not install `authoring-runelight-react`, `refactor-to-runelight-react`, or the deprecated unsplit `authoring-runelight` and `refactor-to-runelight`.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight check` accepts the `.g.vue` entry and lists its frames.
- `runelight check` reports `uncovered-vue-template-branch` when a Vue template branch has no matching frame, then accepts the component after the missing frame is added.
- `/runelight/session` returns serve-session JSON.
- While the dev server is running, adding a new source `.g.vue` frame appears in preview-target output and preview without restarting.
- Editing that added frame updates preview without restarting.
- Removing the temporary frame does not leave a stale usable preview entry.
- `${project.entryRoot}/design` is not created by setup or dev-server startup.
- `runelight changes --json --ui-only` recognizes `.g.vue` changes in the configured source root, reports added and deleted Vue frames clearly, and omits code-only edits that do not change the static visual signature.
- For the provide/inject component, `runelight check` and `runelight preview-targets --json` preserve the injection key as a provider axis with `admin` and `viewer` variants.
- `/runelight?entry=...g.vue%23default&frame=<name>&chrome=0` renders the selected frame through the Vue preview client.
- The rendered preview uses frame `scope` rather than the production setup state for structural template branches.
- The provide/inject preview renders the value supplied by the selected frame's `providers` entry through native Vue `inject(key)`, for both `admin` and `viewer` frames.
- The provide/inject preview does not require app code to import `@runelight/vue/preview`; the app should use `@runelight/adapter-vite-vue/preview`, with the preview runtime reached through the adapter.
- A non-structural helper or formatter from `<script setup>` can still be used by the template during preview.
- The original Vue app route still renders normally.
- A production `vite build` succeeds.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, generated files, and any dev server processes created for this test.
