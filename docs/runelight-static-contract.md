# .g Static Contract

The static-checking contract for the `.g` protocol.

Read [.g Protocol](./g-protocol.md) first for the source-level model: files, frames, seams, and protocol consumers. This document narrows in on the static semantics: what `runelight check` checks, why certain code shapes are required, and what the diagnostics mean.

For Runelight's product architecture and sidecar model, see [Design](./runelight-design.md).

---

## Known Inputs

The static contract treats three dynamic inputs, plus local or imported static constants, as sources of visual state for a `.g` component:

| Input | How it enters |
|-------|--------------|
| **props** | Passed by parent |
| **scope** | Returned from `createGScopeHook(...)` |
| **provider context** | Read through `useGContext(Provider)` |
| **static const literals** | Local `const` values, or imported `const` exports, initialized from literal arrays, objects, and primitives |

If one of these values controls whether a JSX subtree or Vue template branch renders, that relationship must be statically visible. The checker does not need to understand every JavaScript execution path. It only needs to trace the visual branches back to these known inputs.

## Branch Coverage

`runelight check` asks one narrow question per branch:

> Does at least one frame make this branch reachable?

It does not prove every combination of every prop. It only prevents a visual branch from existing in the component while disappearing entirely from the frame set.

### What counts as inspectable

For this to work, render-producing control flow must stay first-order over the known inputs:

| Inspectable shape | Why it works |
|-------------------|-------------|
| `props.open ? <Panel /> : null` | Direct conditional over props |
| `if (scope.status === "ready") return <Panel />` | Direct comparison over scope |
| `scope.canEdit && <button>Edit</button>` | Logical short-circuit over scope |
| `props.items.map(item => item.visible ? <Row /> : null)` | Collection callback traceable to props |
| `staticItems.map(item => item.visible ? <Row /> : null)` | Const literal collection is statically enumerable |
| `staticConfig.enabled ? <Panel /> : null` | Const object properties are static facts |
| `staticMode === "show" && <Panel />` | Const primitives can drive comparisons |
| `importedConfig.enabled ? <Panel /> : null` | Imported const literal exports can be traced across local source files |
| `Barrel.Values.enabled ? <Panel /> : null` | Static const exports can flow through star, named, and namespace barrels |
| `{ ...baseConfig, enabled: true }` | Spread is inspectable when the spread source is a static const literal |

### What is opaque

| Opaque shape | Why it fails |
|-------------|-------------|
| `shouldShow(props) ? <Panel /> : null` | Helper predicate hides the relationship |
| `switch (scope.status) { case "ready": return ... }` | Statement-level branching |
| `const content = scope.ok ? <A/> : <B/>; return content` | Stored JSX variable |
| `items.filter(shouldShow).map(...)` | Predicate hides which items produce JSX |

Opaque shapes are valid React. They are not valid `.g.tsx` protocol shape. `runelight check` reports them as diagnostics - the component must be refactored into inspectable expressions before coverage can be verified.

For Vue SFCs, the same principle applies to template directives. Branches driven by `v-if`, `v-else-if`, `v-show`, `v-for`, and dynamic component `:is` are inspectable when their expressions refer directly to frame `props`, frame `scope`, or native `inject(key)` bindings backed by frame `providers` entries.

### Frame values follow the same rule

Literal props, scope values, provider values, and const declarations initialized from literal arrays, objects, and primitives are inspectable. Imported constants must resolve to local source exports with literal initializers; named re-exports, star re-exports, namespace re-exports, default exports, and aliases of other static const literals are supported. Object and array spreads are inspectable when every spread source is also static. Values produced by helpers, external packages, or unresolved spread composition may typecheck, but they are not static enough for branch coverage. When they affect JSX reachability, `runelight check` reports the uncertainty rather than silently accepting it.

### Type-marked features

Some features need type-level markers because the runtime value alone does not name the intended finite environment axis:

- React provider variants use `createGProvider(..., { variants })` plus `GProviderFrame`.
- Vue injection variants use `defineGInjectionKey(..., { variants })` plus `GVueProviderFrame`.

The frame still carries the runtime value with `providers`; the marker tells preview-target generation and `runelight check` which named variant the frame covers. Provider/injection variant axes are not inferred from arbitrary runtime values.

## Provider Variants

A provider can declare a finite environment axis:

```tsx
const ThemeProvider = createGProvider(useThemeState, {
  variants: ["light", "dark"] as const,
})
```

This means: the provider has exactly these named states, and components consuming it should cover them.

### Marking coverage

Frames mark which variant they represent:

```tsx
Panel.frames = {
  light: {
    description: "Settings panel in the light theme",
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "light" }]],
  } satisfies GProviderFrame<typeof ThemeProvider, "light", PanelProps, never, [typeof ThemeProvider]>,
}
```

`GProviderFrame` is a static marker — it tells preview tooling and `runelight check` what environment the frame covers. Runtime state is still supplied separately through `providers: [[Provider, value]]`.

### Coverage rules

- If a component consumes a provider with declared variants, its frames **must** cover every variant.
- A frame that is genuinely orthogonal to the axis can stay unmarked.
- A frame covering multiple variants can use a union: `GProviderFrame<typeof Provider, "login" | "anonymous">`.
- Variants are only for meaningful finite axes (theme, auth state, role, locale, platform). Omit `variants` for providers carrying arbitrary data.

### Projection

A child that only receives plain props can still mark frames with `GProviderFrame` when those props are shaped by a parent's provider variant. This preserves the environment axis without forcing the child to read context directly.

Child projection frames supplement preview-target expression. They do not replace the parent's coverage obligation.

If Runelight sees provider-derived props flowing into an unmarked child, it reports a non-blocking warning - an agent can decide whether projection markers are needed.

### Composition input precedence

When a `.g` component renders another `.g` component, the child instance is rendered through normal framework composition first.

- Parent-rendered props are authoritative for that child instance, even when those props were derived from the parent's frame `scope`.
- Ancestor provider values are authoritative for that child instance. Child frame provider values are isolated-preview or explicit-override mocks.
- Scope is local to the component seam. A parent frame scope can shape child props or provider values, but it is not inherited as the child's scope.

The checker's branch-coverage question is still component-local: does at least one frame make each branch reachable? Composition input precedence explains how preview should render nested instances; it does not expand `runelight check` into a proof of every parent-child state combination.

See [Composable Frame Inputs](./runelight-composable-inputs.md) for edge cases such as multiple child instances, framework-specific child frame override support, and child-local scope mocks in parent renders.

### Preview expression

Declared variants become environment metadata for preview targets and capture selection. Root-level preview paths can carry one state model while child frame overrides can pin local component states. The model stays explicit in source instead of being inferred from arbitrary runtime values.

## Diagnostics

This section is the complete diagnostic registry for `runelight check`. Every diagnostic is fatal (`runelight check` exits non-zero) except the projection warning at the end.

### Contract-shape diagnostics

These report entries that do not yet satisfy the `.g` protocol shape, before any coverage analysis runs:

| Diagnostic | Applies to | Meaning |
|-----------|-----------|---------|
| `entry-not-found` | React, Vue | The entry file or the requested `#export` does not exist |
| `missing-frames` | React, Vue | A component has no frames declaration |
| `malformed-frames` | React, Vue | Frames are not a statically enumerable object literal, or use unsupported spread composition |
| `non-static-frame-key` | React, Vue | A frame key is computed instead of a literal |
| `missing-frame-description` | React, Vue | A frame does not declare a `description` |
| `non-static-frame-description` | React, Vue | A frame `description` is not a static string |
| `frames-before-component-export` | React | `Component.frames` is assigned before the component declaration |
| `thin-wrapper` | React | A `.g.tsx` entry only renders another local component instead of owning the real visual TSX |
| `non-runelight-hook` | React | A component body calls a raw React/library hook instead of a `createGScopeHook` hook or `useGContext` |
| `multiple-scope-hooks` | React | A component calls more than one primary scope hook |
| `scope-hook-frames-unsupported` | React | `.frames` is attached to a scope hook instead of the component export |
| `missing-component-export` | Vue | A `.g.vue` entry was addressed with a non-default export name |
| `missing-provider` | React, Vue | A frame supplies a provider or injection key the component does not consume |
| `missing-provider-variants` | React, Vue | A frame marks a variant on a provider/key that declares no `variants` |
| `unknown-provider-variant` | React, Vue | A frame marks a variant that the provider/key does not declare |

### Coverage and control-flow diagnostics

These report drift between the declared frame set and the component's reachable visual branches:

| Diagnostic | Applies to | Meaning |
|-----------|-----------|---------|
| `opaque-jsx-control-flow` | React | A JSX branch cannot be traced to props/scope/context |
| `unknown-jsx-branch-coverage` | React | Frame values affecting reachability are not static enough |
| `uncovered-jsx-branch` | React | No frame makes a JSX branch reachable |
| `opaque-vue-template-control-flow` | Vue | A Vue template branch cannot be traced to props/scope/providers |
| `unknown-vue-branch-coverage` | Vue | Frame values affecting Vue template reachability are not static enough |
| `uncovered-vue-template-branch` | Vue | No frame makes a Vue template branch reachable |
| `missing-provider-variant-frames` | React, Vue | A consumed provider's variants are not fully covered |

### Warnings (non-blocking)

| Diagnostic | Applies to | Meaning |
|-----------|-----------|---------|
| `unmarked-provider-variant-projection` | React | A child might need `GProviderFrame` markers for provider-derived props |

The point is not to restrict how production React or Vue works. The point is to prevent preview and capture targets from drifting away from the component's real render surface.
