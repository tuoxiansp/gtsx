# Runelight Vue Authoring Guide

How to write Runelight components: Vue SFCs in `.g.vue` files that use the `.g` protocol, pass `runelight check`, and render correctly in Studio.

Agent workflow: [`authoring-runelight-vue`](../skills/authoring-runelight-vue/SKILL.md). Pattern reference: [`REFERENCE.md`](../skills/authoring-runelight-vue/REFERENCE.md).

If converting existing SFCs, see the [Vue Refactor Guide](./runelight-refactor-guide-vue.md). If the project is not wired yet, run [`setup-runelight`](../skills/setup-runelight/SKILL.md).

---

## Mental model

```
props + scope (+ provide) → template
```

A `.g.vue` file is an ordinary Vue SFC plus one `<g:frames>` block. Preview is **template-first**: frames supply template-visible values; production-only script state does not need to run when the frame covers the branch.

## Which pattern?

```
Visual states are public props only
  → Pure props frames

Template depends on composables, stores, or local script state
  → Frame scope (keep script; supply scope in frames)

Template uses native inject()
  → Frame provide + optional GVueProvideFrame markers
```

## Pure props

```vue
<template>
  <span :data-tone="tone">{{ label }}</span>
</template>

<script setup lang="ts">
defineProps<{ tone: "ok" | "warn"; label: string }>()
</script>

<g:frames>
export default {
  ok: { props: { tone: "ok", label: "Ready" } },
  warn: { props: { tone: "warn", label: "Needs review" } },
}
</g:frames>
```

## Template scope

Put every non-prop value that affects branch shape into frame `scope`:

```vue
<g:frames>
export default {
  loading: { props: { id: "1" }, scope: { status: "loading" } },
  ready: { props: { id: "1" }, scope: { status: "ready", title: "Dashboard" } },
}
</g:frames>
```

## Rules

- One `<g:frames>` block with `export default { ... }` — no nested `<g:frame>` tags.
- Use `scope`, not `bindings`. Use `provide`, not `providers`.
- Structural directives (`v-if`, `v-for`, `:is`) must depend directly on props, scope, or injected frame values — not opaque helper predicates.
- At least two frames when the component has multiple meaningful visual states.
- No secrets or customer data in frames.

## Verification

```sh
runelight check src
```

| Diagnostic | Fix |
|-----------|-----|
| `missing-frames` | Add `<g:frames>` with static keys |
| `opaque-vue-template-control-flow` | Direct template expressions over props/scope/provide |
| `uncovered-vue-template-branch` | Add frame values that reach the branch |
| `missing-provider-variant-frames` | Cover every `defineGInjectionKey` variant |

Full list: [Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).

## Related

- [.g Protocol](./g-protocol.md)
- [Static Contract](./runelight-static-contract.md)
- [React authoring guide](./runelight-authoring-guide.md) — parallel patterns for `.g.tsx`
