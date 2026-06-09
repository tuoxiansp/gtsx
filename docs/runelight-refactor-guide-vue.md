# Runelight Vue Refactor Guide

How to turn existing Vue 3 SFCs into `.g.vue` UI models without preview wrappers.

Agent workflow: [`refactor-to-runelight-vue`](../skills/refactor-to-runelight-vue/SKILL.md).

If the project is not wired yet, run [`setup-runelight`](../skills/setup-runelight/SKILL.md) first. For authoring patterns, see the [Vue Authoring Guide](./runelight-authoring-guide-vue.md).

---

## The one rule

`.g.vue` owns the real template, script, styles, and enumerable visual states. Not a wrapper around the old `.vue` file.

## Decision flow

```
Renders visible DOM?
  no → DESCEND

Owns visual states worth previewing?
  no → SKIP

States representable via props / scope / provide?
  no → SKIP

Would .g.vue only render the old component?
  yes → DESCEND

Mostly props → template?
  yes → MIGRATE

Mixes composables/stores with template?
  yes → SCOPE (frame scope for template-visible values)
```

## Migrate

1. Move template, script, styles into `Component.g.vue`.
2. Add `<g:frames>` with meaningful visual states.
3. Update imports to `./Component.g.vue` (or barrel re-export).

## Scope

1. List every non-prop template value that affects visibility or content.
2. Add static `scope` per frame for those values.
3. Keep production script; preview uses frame `scope` instead.

## Never

- Wrapper SFC that only renders the old component
- `scope` containing component nodes
- Route/layout/provider orchestration as protocol components
- `bindings` field (use `scope`)
- Opaque helpers driving `v-if` / `v-for`

## Done when

- [ ] `.g.vue` owns migrated template and styles
- [ ] Frames cover meaningful states (happy path first)
- [ ] `runelight check` passes
- [ ] Project typecheck passes
