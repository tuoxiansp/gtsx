---
name: refactor-to-runelight-vue
description: Refactor existing Vue 3 TypeScript SFCs into production .g.vue UI models without preview wrappers.
---

# Refactor Existing Vue SFCs To Runelight

Convert existing Vue 3 TypeScript components into `.g.vue` UI models.

## Read First

- This skill owns the Vue refactor workflow and decision gates.
- For concrete `.g.vue` writing patterns, route to `authoring-runelight-vue` and read [Authoring Reference](../authoring-runelight-vue/REFERENCE.md).

If the project isn't wired for Runelight yet, run the `setup-runelight` skill first.

## Invariant

`.g.vue` owns the real SFC template, script, styles, and enumerable visual states. Not a wrapper around an old component.

## Workflow

1. Inspect the target SFC and its rendered children.
2. Apply decision gates: does it render visible DOM? Own visual states? Can those states be represented by props, frame scope, or native `provide` values? Would `.g.vue` just wrap the old SFC?
3. Choose action:
   - **migrate** — pure or mostly local visual SFC, move into `.g.vue`, add `<g:frames>`
   - **scope** — template depends on composables, stores, queries, or local script state; keep production script and supply template-visible state through frame `scope`
   - **descend** — orchestration, inspect children instead
   - **skip** — too risky or no visual surface
4. For `descend`: keep reading until finding real visual surfaces.
5. For `migrate`: move the real template, script, styles, props, and helpers into `Component.g.vue`, add frames, update imports.
6. For `scope`: identify every non-prop template value that affects branch shape or visible state, then add static `scope` values for each important frame.
7. For native injection-dependent UI, import the same injection key in `<g:frames>`, use `provide: [[key, value]]`, and mark meaningful finite axes with `GVueProvideFrame`.
8. Keep structural template branches inspectable: `v-if`, `v-else-if`, `v-show`, `v-for`, and dynamic `:is` should depend directly on props, scope, or injected frame values.
9. Update imports from `./Component.vue` to `./Component.g.vue`. Preserve barrels.
10. Run `runelight check` + project typecheck. Render a frame in Studio if available.

## Never

- `.g.vue` that only renders the old component
- A separate preview wrapper SFC
- `scope` values that contain old component nodes
- Runelight-ifying route/provider/layout orchestration
- Bulk-generating `.g.vue` for every file in a directory
- Preserving old paths by adding wrappers; update imports or use barrels
- Hiding template branch reachability behind helper predicates or uninspectable computed state
- Using `bindings`; Vue frames use `props`, `scope`, and native `provide`

## Done When

- `.g.vue` owns the migrated template and styles
- Frames describe meaningful visual states, happy-path first
- Stateful frames use concrete `scope` values
- Injection frames use `provide` and, when variant axes matter, `GVueProvideFrame`
- Old `.vue` no longer owns migrated visual branches
- `runelight check` passes
- Project typecheck passes, or unrelated failures are reported
