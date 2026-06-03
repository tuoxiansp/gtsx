# gtsx Static Contract

How gtsx knows whether Studio's map of your component can drift from reality.

This document is for the engineer who wants to understand the type-level guarantees: what gtsx checks, why certain code shapes are required, and what the diagnostics mean.

For the architecture and safety model, see [Design](./gtsx-design.md).

---

## Known Inputs

gtsx treats three dynamic inputs, plus local or imported static constants, as sources of visual state for a `.g.tsx` component:

| Input | How it enters |
|-------|--------------|
| **props** | Passed by parent |
| **scope** | Returned from `createGScopeHook(...)` |
| **provider context** | Read through `useGContext(Provider)` |
| **static const literals** | Local `const` values, or imported `const` exports, initialized from literal arrays, objects, and primitives |

If one of these values controls whether a JSX subtree renders, that relationship must be statically visible. gtsx does not need to understand every JavaScript execution path. It only needs to trace the visual branches back to these known inputs.

## Branch Coverage

`gtsx check` asks one narrow question per branch:

> Does at least one frame make this branch reachable?

It does not prove every combination of every prop. It only prevents a visual branch from existing in the component while disappearing entirely from the frame set.

### What counts as inspectable

For this to work, JSX-producing control flow must stay first-order over the known inputs:

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

Opaque shapes are valid React. They are not valid gtsx protocol shape. `gtsx check` reports them as diagnostics — the component must be refactored into inspectable expressions before coverage can be verified.

### Frame values follow the same rule

Literal props, scope values, provider values, and const declarations initialized from literal arrays, objects, and primitives are inspectable. Imported constants must resolve to local source exports with literal initializers; named re-exports, star re-exports, namespace re-exports, default exports, and aliases of other static const literals are supported. Object and array spreads are inspectable when every spread source is also static. Values produced by helpers, external packages, or unresolved spread composition may typecheck, but they are not static enough for branch coverage. When they affect JSX reachability, `gtsx check` reports the uncertainty rather than silently accepting it.

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
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "light" }]],
  } satisfies GProviderFrame<typeof ThemeProvider, "light", PanelProps, never, [typeof ThemeProvider]>,
}
```

`GProviderFrame` is a static marker — it tells Studio and `gtsx check` what environment the frame covers. Runtime state is still supplied separately through `providers: [[Provider, value]]`.

### Coverage rules

- If a component consumes a provider with declared variants, its frames **must** cover every variant.
- A frame that is genuinely orthogonal to the axis can stay unmarked (neutral in Studio).
- A frame covering multiple variants can use a union: `GProviderFrame<typeof Provider, "login" | "anonymous">`.
- Variants are only for meaningful finite axes (theme, auth state, role, locale, platform). Omit `variants` for providers carrying arbitrary data.

### Projection

A child that only receives plain props can still mark frames with `GProviderFrame` when those props are shaped by a parent's provider variant. This lets Studio show the environment axis without forcing the child to read context directly.

Child projection frames supplement Studio expression. They do not replace the parent's coverage obligation.

If gtsx sees provider-derived props flowing into an unmarked child, it reports a non-blocking warning — an agent can decide whether projection markers are needed.

### Studio expression

Declared variants become environment controls in Studio. A root-level selection constrains the canvas. A component-level selection overrides locally. Matching and mismatching frames are distinguished visually rather than filtered away, so you always see the full state model.

## Diagnostics

All coverage and control-flow diagnostics are fatal (`gtsx check` exits non-zero):

| Diagnostic | Meaning |
|-----------|---------|
| `opaque-jsx-control-flow` | A JSX branch cannot be traced to props/scope/context |
| `unknown-jsx-branch-coverage` | Frame values affecting reachability are not static enough |
| `uncovered-jsx-branch` | No frame makes a JSX branch reachable |
| `missing-provider-variant-frames` | A consumed provider's variants are not fully covered |

Projection hints are warnings (non-blocking):

| Diagnostic | Meaning |
|-----------|---------|
| `unmarked-provider-variant-projection` | A child might need `GProviderFrame` markers for provider-derived props |

The point is not to restrict how production React works. The point is to prevent Studio's map from drifting away from the component's real TSX.
