# Runelight Vue Refactor Guide

How to turn existing Vue 3 SFCs into `.g.vue` UI models without creating wrappers. For React, see the [React Refactor Guide](./runelight-refactor-guide.md).

The canonical workflow for AI agents lives in [`skills/refactor-to-runelight-vue/SKILL.md`](../skills/refactor-to-runelight-vue/SKILL.md). This guide is the human-readable version: the decision framework, the key moves, and the traps to avoid.

If the project isn't wired for Runelight yet, follow the [Setup Playbook](../installer/runelight-setup.md) first. For authoring patterns in the resulting `.g.vue`, see the [Vue Authoring Guide](./runelight-vue-authoring-guide.md).

---

## The One Rule

`.g.vue` owns the real SFC template, script, styles, and enumerable visual states. It is not a wrapper around an old component.

If the visual UI cannot be safely moved into `.g.vue`, skip that component. Never create a thin forwarding layer just to show progress.

## Choosing Targets

Start from a user-visible visual surface, not from a file tree sweep.

**Good targets** render visible DOM and own visual branches: loading, empty, error, overflow, open, selected, disabled, permission states.

**Bad targets** are orchestration: route glue, provider nesting, layout slots, feature composition, data plumbing. Descend through them until you find real visual surfaces.

## Decision Flow

```
Does it render visible DOM?
  no → DESCEND (look at children)

Does it own visual states worth previewing?
  no → SKIP

Can those states be represented by props, frame scope, or injection values?
  no → SKIP

Would the .g.vue just wrap the old SFC?
  yes → DESCEND (you'd be creating a wrapper)

Is the SFC pure or mostly local visual state?
  yes → MIGRATE

Does the template depend on composables, stores, queries, or local script state?
  yes → SCOPE
```

## Migrate: Pure SFC

The simplest refactor. The `.g.vue` file becomes the production component.

1. Move the real template, script, styles, props, and helpers into `Component.g.vue`.
2. Keep the component name and props contract stable.
3. Add a `<g:frames>` block with meaningful visual states.
4. Update imports from `./Component.vue` to `./Component.g.vue`.
5. Preserve public APIs through barrels where they exist.

## Scope: Stateful SFC

Unlike React, the production `<script setup>` usually stays as-is — preview is template-first, so there is no hook-wrapping step:

1. Identify every non-prop template value that affects branch shape or visible state.
2. Keep production composables, stores, and queries in `<script setup>`.
3. Add static `scope` values for each of those template values in every important frame.
4. Make structural directives (`v-if`, `v-for`, `v-show`, dynamic `:is`) depend directly on props, scope, or injected values.

## Native Injection

For SFCs that call `inject(key)`: import the same injection key inside `<g:frames lang="ts">`, supply runtime values through `providers: [[key, value]]`, and mark meaningful finite axes (role, theme, locale, auth state) with `defineGInjectionKey` variants plus `GVueProviderFrame` markers.

## Child Components

Plain Vue children can keep running in preview when their script is safe in dev. If a business child has remote data, auth, router, or store assumptions that break preview:

- make the child a `.g.vue` protocol component too;
- or keep the parent frame focused on parent-owned state and model the child separately;
- or stub the unsafe app-level dependency in the preview host.

## Anti-Patterns

These are never valid refactor outputs:

- **Wrapper:** a `.g.vue` that only renders the old component
- **Separate preview wrapper SFC** beside the production one
- **Component nodes in scope:** `scope` values containing old component instances
- **Orchestration in `.g.vue`:** route/provider/layout wrappers converted into UI models
- **Bulk generation:** sweeping a directory and creating `.g.vue` for every file
- **Opaque branches:** structural directives driven by helper predicates or uninspectable computed state
- **`bindings`:** Vue frames use `props`, `scope`, and `providers`

## Done When

- [ ] The `.g.vue` file owns the migrated template, script, and styles
- [ ] Export names and props contracts are stable
- [ ] Imports point at the `.g.vue` module (or a barrel re-exports it)
- [ ] Frames enumerate meaningful visual states (happy-path first, at least two)
- [ ] Stateful frames use concrete `scope` values
- [ ] Injection frames use `providers` and, when variant axes matter, `GVueProviderFrame`
- [ ] The old `.vue` file no longer owns the migrated visual branches
- [ ] Preview observation uses `runelight containing-frames <entry#default> --json` or an equivalent covered app/screen/parent entry that shows the migrated surface in real layout context when such coverage exists
- [ ] `runelight check` passes
- [ ] Project typecheck passes
