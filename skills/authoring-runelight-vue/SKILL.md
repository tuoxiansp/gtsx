---
name: authoring-runelight-vue
description: "Write, edit, or review Runelight Vue SFC components in .g.vue files. Use when working on Vue .g protocol components, <g:frames>, template-first scope frames, Vite Vue preview, or Vue Runelight authoring diagnostics."
---

# Authoring Runelight Vue Components

Use this project-level skill for Vue SFC Runelight component authoring. For React/TSX components, use `authoring-runelight-react`.

## Core Idea

A Vue Runelight component is an ordinary Vue SFC in a `.g.vue` file plus one `<g:frames>` custom block.

```
props + scope -> template
```

Preview is template-first: frames provide the template-visible values needed to render visual states. Production-only `<script setup>` state does not need to run during preview when the frame supplies the values used by the template.

Vue native `provide`/`inject` is an advanced authoring surface. Use it only when the component already injects Vue context. Frames may use `providers: [[key, value]]`; finite preview axes need a typed `defineGInjectionKey` plus `GVueProviderFrame` marker.

In composition, parent-rendered props and ancestor Vue injection values are authoritative for nested children. A child `.g.vue` frame is an isolated-preview mock unless the preview runtime explicitly selects that child frame. Current Vue preview preserves this by rendering unselected nested `.g.vue` children as ordinary SFCs with `<g:frames>` removed.

## Quick Start

```vue
<template>
  <section v-if="status === 'ready'">
    <h1>{{ user.name }}</h1>
    <p>{{ props.userId }}</p>
  </section>
  <p v-else>Loading {{ props.userId }}</p>
</template>

<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const status = useRemoteStatus(props.userId)
</script>

<g:frames>
export default {
  loading: {
    description: "Loading state while remote user data is unavailable",
    props: { userId: "user_loading" },
    scope: { status: "loading" },
  },
  ready: {
    description: "Ready state with loaded user details",
    props: { userId: "user_42" },
    scope: {
      status: "ready",
      user: { name: "Ada Lovelace" },
    },
  },
}
</g:frames>
```

Verify:

```sh
runelight check src/UserCard.g.vue
runelight preview-targets src/UserCard.g.vue#default --json
runelight capture --path "<target.path>"
```

## Workflow

1. Create or edit a real `.g.vue` SFC.
2. Keep one normal `<template>` and normal Vue script blocks.
3. Add exactly one `<g:frames>` block with direct `export default { ... }`.
4. Give each meaningful frame a concise static `description` string, then use `props` for public component inputs and `scope` for frame-supplied template state.
5. Make structural template branches reachable through frame `props`, `scope`, or static injected values from frame `providers`.
6. Use `runelight inspect <entry#default> --json` when composing UI and you need the reachable GUI map for the entry.
7. Run `runelight check` and fix diagnostics.
8. Get rendered feedback through the nearest covered app/screen/parent entry when available. Use `runelight preview-targets <entry#default> --json`, open representative `/runelight?...` paths in the browser or capture them with `runelight capture --path "<target.path>"`, then fix mismatches between the rendered UI, frame descriptions, and intended states.
9. Run the host typecheck/build when touched props, imports, styles, or framework wiring could break normal app code.

## Authoring Feedback Loop

Authoring is not done when the SFC merely typechecks or passes `runelight check`. A new or edited `.g.vue` entry must also be observed through the Runelight preview path when the project is wired for preview.

1. Run `runelight check <entry#default|file.g.vue>` and fix contract diagnostics.
2. Choose the observation root. Default to the nearest meaningful covered app/screen/parent entry that renders the component, especially when checking layout, spacing, density, theme, container width, or sibling alignment. Use the component's own entry only when no covered parent exists, the component is itself the app/screen entry, or you are debugging its isolated frame contract.
3. Run `runelight containing-frames <entry#default> --json` for the component. Prefer contexts whose `root.coordinate` differs from the target; if every returned root is the target, treat it as target-level coverage rather than broader app/screen context.
4. If no ancestor context is available, find parent/root candidates with `rg` imports/usages, nearby route/screen `.g.vue` files, changed parent `.g.vue` files, and `runelight inspect <entry#default> --json` on likely app/screen entries. Then run `runelight preview-targets <observation-entry#default> --json`.
5. Read the target paths and frame descriptions. Choose the happy path plus the new or risky edge states you just authored. For child-component work, prefer paths whose `paths` nodes include both the parent state and the target child state when Vue preview exposes that composition path; otherwise note the Vue nested-preview limitation.
6. Open those `/runelight?...` paths in the browser, or run `runelight capture --path "<target.path>"` for selected targets.
7. Compare rendered output against the frame `description`, intended props/scope/provider values, template branch coverage, parent layout context, and local design language.
8. If the render is wrong, edit the SFC or frames and repeat the same preview/capture observation.
9. Finish with `runelight check` and typecheck/build when code changes can affect the host app.

If preview is not available because setup or the Host is missing, say that rendered feedback was blocked and name the missing setup step. If the work turns into subjective visual polish rather than authoring coverage, switch to the `polish` workflow and perform its required sync before editing.

## Rules

- Use `.g.vue`, not plain `.vue`, for protocol components.
- Do not use nested `<g:frame>` tags.
- Do not use `bindings`; the Vue frame payload is `props`, `scope`, and `providers` for injection values.
- Use `providers`, not `provide`, for Runelight frame injection values.
- Import the same injection key in `<g:frames>` that the component passes to `inject(key)`.
- Use `GVueProviderFrame` only for meaningful finite axes such as role, theme, locale, auth state, or platform.
- Frame keys must be statically enumerable object literal keys.
- Frame `description` values should be static strings that explain the visible state or scenario for agents reading `preview-targets` output.
- Keep frames static. Do not generate frame objects from runtime code.
- `scope` should include every non-prop template value that affects branch shape.
- Opaque helpers are okay for formatting text, but not for structural directives.
- For structural branches, prefer direct template expressions over opaque helper predicates.
- Preserve ordinary Vue children when they are safe to run in dev. Parent props and injection values should flow normally into child components; do not write child frames expecting them to replace values the parent actually passes.
- Current Vue preview does not support React-style explicit nested child frame overrides. Business children with unsafe script state should become `.g.vue` entries and be inspected in isolation, or be stubbed by the host.
- Do not put secrets or customer data in frames.

## Template Contract

Structural directives such as `v-if`, `v-for`, `v-show`, and dynamic `:is` should be first-order over frame-visible values:

```vue
<!-- Good -->
<section v-if="status === 'ready'">{{ user.name }}</section>

<!-- Risky for static coverage -->
<section v-if="isReady(user)">{{ user.name }}</section>
```

## Reference

Detailed patterns: [REFERENCE.md](./REFERENCE.md)

## CLI

```sh
runelight check <file.g.vue|dir>              # validate contracts
runelight inspect <file.g.vue> --json         # inspect static GUI dependencies for one entry
runelight serve                               # start Runelight preview server
runelight preview-targets <file.g.vue#default> --json  # paged preview paths, default 20
runelight capture --path "<target.path>"      # screenshot one selected path
```
