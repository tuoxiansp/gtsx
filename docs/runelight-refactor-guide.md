# Runelight React Refactor Guide

How to turn existing React components into `.g.tsx` UI models without creating wrappers. For Vue SFCs, see the [Vue Refactor Guide](./runelight-vue-refactor-guide.md).

The canonical workflow for AI agents lives in [`skills/refactor-to-runelight-react/SKILL.md`](../skills/refactor-to-runelight-react/SKILL.md). This guide is the human-readable version: the decision framework, the key moves, and the traps to avoid.

If the project isn't wired for Runelight yet, run [`setup-runelight`](../skills/setup-runelight/SKILL.md) first. For authoring patterns in the resulting `.g.tsx`, see the [React Authoring Guide](./runelight-authoring-guide.md).

---

## The One Rule

`.g.tsx` contains real visual UI. It is not a preview wrapper around existing TSX.

React UI can always move toward Runelight coverage. If the current file cannot be migrated directly, the real visual surface, state seam, or inspectable branch shape has not been exposed yet.

Do not ask which React components are "suitable for Runelight." Ask where the real visual surface lives, then move that surface into `.g.tsx` by migrating, splitting, descending, extracting, or normalizing. Never create a thin forwarding layer just to show progress.

Skip is a last conclusion, not the opening filter. Use it only when inspection shows there is no owned visual UI, or when moving the UI would require a wrapper/runtime shell/product-boundary change rather than a `.g.tsx` refactor.

## Choosing Targets

Start from a user-visible visual surface, not from a file tree sweep.

**Good targets** render DOM, TSX, and visible branches: loading, empty, error, overflow, open, selected, disabled, permission states.

**Orchestration targets** are route glue, provider nesting, layout slots, feature composition, data plumbing. They are usually not final `.g.tsx` outputs, but they are useful maps. Descend through them until you find real visual surfaces, or extract their visible JSX behind props/scope when the file mixes orchestration with UI.

Before deciding, gather enough migration information: prop contract, rendered JSX, branch inputs, hook/query/store/router reads, context/provider reads, callbacks, CSS/static assets, child visual surfaces, and import boundaries.

## Decision Flow

```
Does it render real DOM?
  no → DESCEND (look at children)

Does it own visual states worth previewing?
  no → DESCEND or DEFER with blocker

Can those states be controlled by props / scope / providers?
  no → SPLIT, EXTRACT, or DEFER with blocker

Would the .g.tsx file just render the old component?
  yes → DESCEND (you'd be creating a wrapper)

Does legal React control flow hide branch reachability?
  yes → NORMALIZE

Is the UI mostly pure (props → view)?
  yes → MIGRATE

Does it mix hooks/effects/state with visual TSX?
  yes → SPLIT

Does it mix route/server/container work with visual TSX?
  yes → EXTRACT
```

## Migrate: Pure UI

The simplest refactor. The `.g.tsx` file becomes the production component.

1. Move component, UI prop types, and visual helpers into `Component.g.tsx`.
2. Keep component name and props contract stable.
3. Add `Component.frames` with meaningful visual states.
4. Update imports from `./Component` to `./Component.g`.
5. Preserve public APIs through barrels: `export { Component } from "./Component.g"`.

## Split: Stateful UI

For components that mix hooks/effects/state with visual TSX.

1. Identify everything the TSX reads from hooks, effects, router, stores, or fetches.
2. Define a `Scope` type — only the values and callbacks the view actually uses.
3. Move production behavior into `useRealComponentScope(props)`.
4. Wrap it: `const useScope = createGScopeHook(useRealComponentScope)`.
5. The `.g.tsx` component calls only the wrapped hook and renders the real TSX.
6. Add frames injecting `scope` for each important visual state.

The old file may remain as the scope hook source, or you can co-locate the real hook in the `.g.tsx` file — whatever keeps imports clean.

## Split: Server Components

Server Components often mix request-time work with visual JSX. Don't try to preview the server work. Split the visual surface into a `.g.tsx` export that can run in the client preview graph:

**Before:** one file that fetches data and renders UI.

**After:** a server entry that fetches data and passes props to a `.g.tsx` view component.

The preview transform removes `import "server-only"` and directive markers. It does not remove real server APIs (database clients, `next/headers`, secrets). If those are still imported by the visual module, preview will fail — move that work behind props or scope.

## Extract: Containers And Routes

Containers and route files often look "not suitable" because they combine useful UI with routing, data loading, mutations, permissions, or app shell wiring. Do not stop there. Extract the visible JSX and the values it reads:

1. List the values that affect what the user sees.
2. Keep non-previewable work in the route/container.
3. Create a `.g.tsx` view component whose props/scope/provider values describe those visible values.
4. Update the production caller to render the `.g.tsx` view.
5. Add frames for the concrete states the original container could show.

This is different from a wrapper: the `.g.tsx` file owns the real visual TSX after extraction.

## Normalize: Opaque React

Some valid React is too opaque for Runelight's static branch coverage. Keep the behavior, but rewrite the render shape so the visible branches are first-order over props, scope, providers, or static const facts:

| React shape | Runelight move |
| --- | --- |
| Helper predicate controls JSX | Inline or expose the predicate result as props/scope, then branch directly |
| `switch` returns JSX | Rewrite to `if` returns or direct conditionals over the discriminant |
| Stored JSX variable | Return the conditional JSX directly at the render site |
| `filter(...).map(...)` produces JSX | Use a traceable `map` callback with the item branch inside it |
| Runtime-generated frame data | Replace with static frame object literals |

Normalization is not a product compromise. It is the step that makes the existing visual behavior inspectable.

## Migration Matrix

| Existing React shape | Default action | What to expose |
| --- | --- | --- |
| Props-only visual component | Migrate | Props and frames |
| Component with hooks, queries, stores, router, effects, timers, or local state | Split | `Scope` containing only values and callbacks the view reads |
| Context, auth, theme, locale, feature flag, or platform-dependent UI | Split or add provider | `createGProvider`, `useGContext`, finite provider variants when meaningful |
| Route, page, server component, loader, or mutation container with visible JSX | Extract | `.g.tsx` view props/scope; keep non-previewable work in the caller |
| Layout/provider/router shell with no owned DOM | Descend | Child visual surfaces |
| Helper predicates, `switch`, stored JSX, or JSX-producing loops | Normalize | Direct branch expressions over props/scope/providers/static facts |
| `children`, slots, or render props that are the public visual contract | Migrate with real slot props | Frame values for the visible slot scenarios; never put old component nodes in scope |
| Local wrapper around another component | Descend or move frames | The component that owns the real visual TSX |
| Third-party component as a dependency | Keep as dependency or wrap only owned UI around it | Owned props/states; do not claim coverage of closed third-party internals |
| Portal, imperative DOM, canvas, or ref-driven visual behavior | Extract declarative shell or defer with blocker | The visible state model that can be represented without replacing the runtime boundary |

## Anti-Patterns

These are never valid refactor outputs:

- **Wrapper:** `export default function X(props) { return <OldX {...props} /> }`
- **Node scope:** `scope: { node: <OldComponent /> }`
- **Runtime wrapper:** `<RunelightPreviewRuntime><OldClient /></RunelightPreviewRuntime>`
- **Orchestration in `.g.tsx`:** route/provider/layout wrappers converted into UI models
- **Bulk generation:** sweeping a directory and creating `.g.tsx` for every file
- **Opaque branches:** hiding JSX reachability behind `switch`, helper predicates, or stored JSX variables
- **Suitability language:** reporting that a component is not suitable without naming the concrete blocker and the next information needed

## Done When

- [ ] The `.g.tsx` file contains real visual UI, not a wrapper
- [ ] Export names and props contracts are stable
- [ ] Imports point at the `.g` module (or barrel re-exports it)
- [ ] Frames enumerate meaningful visual states (happy-path first, at least two)
- [ ] Stateful frames use concrete scope values and no-op callbacks
- [ ] The old file is no longer responsible for the migrated visual branches
- [ ] Deferred targets, if any, name the blocker instead of saying they were not suitable
- [ ] `runelight check` passes
- [ ] Project typecheck passes
