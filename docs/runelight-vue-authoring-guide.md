# Runelight Vue Authoring Guide

How to write Runelight components: Vue 3 SFCs in `.g.vue` files that use the `.g` protocol, pass `runelight check`, and render correctly in preview. For React, see the [React Authoring Guide](./runelight-authoring-guide.md).

This is the human-readable companion to the Vue agent skill. The canonical reference for all Vue patterns lives in [skills/authoring-runelight-vue/REFERENCE.md](../skills/authoring-runelight-vue/REFERENCE.md). This guide covers the mental model and decision points.

If converting existing SFCs, start with the [Vue Refactor Guide](./runelight-vue-refactor-guide.md). If the project isn't wired for Runelight yet, follow the [Setup Playbook](../installer/runelight-setup.md).

---

## The Mental Model

A Runelight Vue component is an ordinary Vue SFC in a `.g.vue` file plus one `<g:frames>` custom block. Each file exposes one protocol component entry: the default SFC component at `path/to/File.g.vue#default`.

The contract is template-first:

```
props + scope → template
```

Preview keeps the SFC template and styles, reads the selected frame, and injects the frame's `props` and `scope` into a synthetic preview setup. Production-only `<script setup>` state does not need to run during preview as long as the frame supplies the values the template actually uses.

A `.g.vue` file contains:

- A normal `<template>` (the actual DOM this component renders)
- A normal `<script setup lang="ts">` with production behavior
- Optional `<style>` blocks — preview preserves them
- One `<g:frames>` block whose content is a single static `export default { ... }` object

## Which Frame Fields Do I Need?

```
Every visual state is described by public component inputs
  → props only

The template reads composables, stores, queries, or local script state
  → props + scope

The component calls Vue's native inject(key)
  → props + providers (and GVueProviderFrame for finite axes)
```

`scope` should include every non-prop template value that affects branch shape or visible state. Vue frames never use `bindings`; injection-dependent frames use Runelight `providers` entries that preview maps to Vue native `provide(...)`.

## Props and Scope

```vue
<template>
  <article>
    <p v-if="status === 'loading'">Loading {{ resourceId }}</p>
    <section v-else>
      <h1>{{ title }}</h1>
      <p>{{ items.length }} items</p>
    </section>
  </article>
</template>

<script setup lang="ts">
const props = defineProps<{ resourceId: string }>()
const { status, title, items } = useResource(props.resourceId)
</script>

<g:frames>
export default {
  loading: {
    description: "Loading state while resource data is unavailable",
    props: { resourceId: "res_1" },
    scope: { status: "loading" },
  },
  ready: {
    description: "Ready state with resource items loaded",
    props: { resourceId: "res_1" },
    scope: { status: "ready", title: "Dashboard", items: [1, 2, 3] },
  },
}
</g:frames>
```

Preview never runs `useResource`; `status`, `title`, and `items` come from the selected frame's `scope`. Helpers that only format displayed text (such as `formatDate(...)`) can stay as ordinary script functions.

## Native Provide / Inject

Vue context uses native `provide`/`inject`. When the injection should appear as a finite preview axis (role, theme, locale, auth state, platform), define a typed key with `defineGInjectionKey(..., { variants })`, import the same key in `<g:frames lang="ts">`, supply runtime values through `providers: [[key, value]]`, and mark coverage with `GVueProviderFrame`. See [.g Protocol — Vue Provide/Inject](./g-protocol.md#vue-provideinject) for a complete example.

## Composition

When a `.g.vue` parent renders a `.g.vue` child, the parent render remains authoritative. Props passed by the parent are the child's props, and ancestor Vue injection values are the child's injected context. The parent's frame `scope` can shape those props or provider values, but it does not become the child's scope.

Current Vue preview preserves this by rendering unselected nested `.g.vue` children as ordinary SFCs with `<g:frames>` removed. Inspect child frames in isolation when you need the child's own frame mocks; React-style explicit nested child frame overrides are not available in Vue preview yet.

## Frames

- Frame names describe what appears on screen: `ready`, `loading`, `empty`, `error`, `disabled`, `overflowing`, `anonymous`.
- Happy-path frame first, then edge states.
- Every frame has a required static `description` string.
- Frames are static object literals with enumerable keys — no computed keys, no runtime generation, no top-level spread.
- No secrets or customer data.

## Template Branches

Structural directives — `v-if`, `v-else-if`, `v-show`, `v-for`, and dynamic `:is` — must be first-order over frame-visible values: frame `props`, frame `scope`, or `inject(key)` bindings backed by frame `providers` entries. Opaque helpers are fine for formatting text, but not for structural decisions:

```vue
<!-- Good -->
<section v-if="status === 'ready'">{{ user.name }}</section>

<!-- Opaque for static coverage -->
<section v-if="isReady(user)">{{ user.name }}</section>
```

For the full rules, see [Static Contract](./runelight-static-contract.md).

## Verification And Feedback

```sh
runelight check src/UserCard.g.vue                         # validate the static contract
runelight preview-targets src/UserCard.g.vue#default --json # list browser-ready preview paths
runelight capture --path "<target.path>"                    # capture one selected rendered state
runelight check src                                         # validate a directory
```

Authoring is a feedback loop, not only a static check:

1. Run `runelight check <entry#default|file.g.vue>` and fix diagnostics.
2. Choose the observation root. Default to the nearest meaningful covered app/screen/parent entry that renders the component, especially when checking layout, spacing, density, theme, container width, or sibling alignment.
3. Use the component's own entry only when no covered parent exists, the component is itself the app/screen entry, or you are debugging its isolated frame contract.
4. Run `runelight containing-frames <entry#default> --json`. Prefer contexts whose `root.coordinate` differs from the target; if every returned root is the target, treat it as target-level coverage rather than broader app/screen context. If no ancestor context is available, run `runelight preview-targets <observation-entry#default> --json`.
5. Choose representative paths from the output: the happy path plus new, changed, or risky edge frames. For child-component work, prefer paths whose `paths` nodes include both the parent state and the target child state when Vue preview exposes that composition path; otherwise note the Vue nested-preview limitation.
6. Open the `/runelight?...` paths in the browser, or capture selected targets with `runelight capture --path "<target.path>"`.
7. Compare the rendered output with the frame `description`, intended props/scope/provider values, template branch coverage, parent layout context, and local design language.
8. If the render is wrong, edit the SFC or frames and observe the same targets again.
9. Finish with `runelight check` and project typecheck or host build when the change can affect ordinary app code.

If the Host or preview route is not wired yet, report that rendered feedback is blocked and follow the setup playbook before claiming preview confidence. If the work becomes subjective visual polish rather than coverage authoring, use the `polish` workflow and its required sync.

Common diagnostics and fixes:

| Diagnostic | Fix |
|-----------|-----|
| `missing-frames` | Add a `<g:frames>` block with `export default { ... }` |
| `malformed-frames` | Use one direct `export default { ... }` object; no spread composition |
| `non-static-frame-key` | Use literal frame keys |
| `missing-frame-description` | Add a static `description` string to the frame |
| `non-static-frame-description` | Replace the frame `description` with a literal string |
| `opaque-vue-template-control-flow` | Make structural directives depend directly on props/scope/injected values |
| `uncovered-vue-template-branch` | Add a frame that makes the template branch reachable |
| `missing-provider-variant-frames` | Mark frames with `GVueProviderFrame` for every declared injection variant |

Full diagnostic list: [Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).
