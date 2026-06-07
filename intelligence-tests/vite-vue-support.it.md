# Vite Vue Support

Validate Runelight's Vue support in a fresh Vite Vue project.

Create a temporary Vite Vue 3 app outside the repository workspace and wire it to the local Runelight packages from this checkout. Configure Vite with `@vitejs/plugin-vue` and `runelightViteVue()`. Add `runelight.config.ts` with `project.sourceRoot` and `project.entryRoot`, and add a development-only `/runelight` branch that mounts `RunelightViteVuePreviewClient` with `createRunelightViteVuePreviewComponentLoader`.

Add at least one `.g.vue` component under the selected source root. The file must use a normal Vue `<template>`, a normal `<script setup lang="ts">`, and a single direct `<g:frames>` block whose content is `export default { ... }`. Do not use nested `<g:frame>` tags. Include at least two frames where `props` and `scope` drive visible template branches.

Validate these outcomes:

- `runelight check` accepts the `.g.vue` entry and lists its frames.
- `/runelight/studio/manifest` returns JSON that includes the `.g.vue#default` coordinate and every frame from `<g:frames>`.
- `/runelight?entry=...g.vue%23default&frame=<name>&chrome=0` renders the selected frame through the Vue preview client.
- The rendered preview uses frame `scope` rather than the production setup state for structural template branches.
- A non-structural helper or formatter from `<script setup>` can still be used by the template during preview.
- The original Vue app route still renders normally.
- A production `vite build` succeeds.

Clean up the temporary project, generated files, and any dev server processes created for this test.
