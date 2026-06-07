# Runelight Refactor Guide

How to turn existing React components into `.g.tsx` UI models without creating wrappers.

The canonical workflow for AI agents lives in [`skills/refactor-to-runelight/SKILL.md`](../skills/refactor-to-runelight/SKILL.md). This guide is the human-readable version: the decision framework, the key moves, and the traps to avoid.

If the project isn't wired for Runelight yet, run [`setup-runelight`](../skills/setup-runelight/SKILL.md) first. For authoring patterns in the resulting `.g.tsx`, see the [Authoring Guide](./runelight-authoring-guide.md).

---

## The One Rule

`.g.tsx` owns real visual UI. It is not a preview wrapper around existing TSX.

If the visual UI cannot be safely moved into `.g.tsx`, skip that component. Never create a thin forwarding layer just to show progress.

## Choosing Targets

Start from a user-visible visual surface, not from a file tree sweep.

**Good targets** own DOM, TSX, and visible branches: loading, empty, error, overflow, open, selected, disabled, permission states.

**Bad targets** are orchestration: route glue, provider nesting, layout slots, feature composition, data plumbing. Descend through them until you find real visual surfaces.

## Decision Flow

```
Does it render real DOM?
  no → DESCEND (look at children)

Does it own visual states worth previewing?
  no → SKIP

Can those states be controlled by props / scope / providers?
  no → SKIP

Would the .g.tsx file just render the old component?
  yes → DESCEND (you'd be creating a wrapper)

Is the UI mostly pure (props → view)?
  yes → MIGRATE

Does it mix hooks/effects/state with visual TSX?
  yes → SPLIT
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

## Anti-Patterns

These are never valid refactor outputs:

- **Wrapper:** `export default function X(props) { return <OldX {...props} /> }`
- **Node scope:** `scope: { node: <OldComponent /> }`
- **Runtime wrapper:** `<RunelightPreviewRuntime><OldClient /></RunelightPreviewRuntime>`
- **Orchestration in `.g.tsx`:** route/provider/layout wrappers converted into UI models
- **Bulk generation:** sweeping a directory and creating `.g.tsx` for every file
- **Opaque branches:** hiding JSX reachability behind `switch`, helper predicates, or stored JSX variables

## Done When

- [ ] The `.g.tsx` file contains real visual UI, not a wrapper
- [ ] Export names and props contracts are stable
- [ ] Imports point at the `.g` module (or barrel re-exports it)
- [ ] Frames enumerate meaningful visual states (happy-path first, at least two)
- [ ] Stateful frames use concrete scope values and no-op callbacks
- [ ] The old file no longer owns the migrated visual branches
- [ ] `runelight check` passes
- [ ] Project typecheck passes
