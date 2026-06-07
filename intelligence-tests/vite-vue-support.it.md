# Vite Vue Support

Validate Runelight's Vue support in a fresh Vite Vue project.

Create a temporary Vite Vue 3 app outside the repository workspace. Exercise the README installer flow: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level setup skill. Setup should wire the local Runelight packages from this checkout, configure Vite with `@vitejs/plugin-vue` and `runelightViteVue()`, add `runelight.config.ts` with `project.sourceRoot` and `project.entryRoot`, and add a development-only `/runelight` branch that mounts `RunelightViteVuePreviewClient` with `createRunelightViteVuePreviewComponentLoader`.

Add at least one `.g.vue` component under the selected source root. The file must use a normal Vue `<template>`, a normal `<script setup lang="ts">`, and a single direct `<g:frames>` block whose content is `export default { ... }`. Do not use nested `<g:frame>` tags. Include at least two frames where `props` and `scope` drive visible template branches.

Validate these outcomes:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup installs or refreshes only the Vue companion skill needed for this project: `authoring-runelight-vue`.
- Setup does not install `authoring-runelight-react`, `refactor-to-runelight`, `design-runelight`, or the deprecated unsplit `authoring-runelight`.
- The installer prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight check` accepts the `.g.vue` entry and lists its frames.
- `/runelight/studio/manifest` returns JSON that includes the `.g.vue#default` coordinate and every frame from `<g:frames>`.
- `/runelight?entry=...g.vue%23default&frame=<name>&chrome=0` renders the selected frame through the Vue preview client.
- The rendered preview uses frame `scope` rather than the production setup state for structural template branches.
- A non-structural helper or formatter from `<script setup>` can still be used by the template during preview.
- The original Vue app route still renders normally.
- A production `vite build` succeeds.
- The test does not write Runelight companion skills into the user's global skills directory. If global Runelight skills already exist, do not treat them as proof of success; inspect project-local `.agents/skills`.

Clean up the temporary project, generated files, and any dev server processes created for this test.
