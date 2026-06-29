---
name: refactor-to-runelight-react
description: Refactor existing React TSX into production .g.tsx UI models without preview wrappers.
---

# Refactor Existing React TSX To Runelight

Convert existing React components into `.g.tsx` UI models.

## Read First

- This skill owns the React refactor workflow and decision gates.
- For concrete `.g.tsx` writing patterns, route to `authoring-runelight-react` and read [Authoring Reference](../authoring-runelight-react/REFERENCE.md).

If the project isn't wired for Runelight yet, run the `setup-runelight` skill first.

## Invariant

`.g.tsx` owns real visual UI and enumerable visual states. Not a wrapper.

## Workflow

1. Inspect the target component and its tree.
2. Apply decision gates: does it render DOM? Own visual states? States controllable by props/scope/providers? Would `.g.tsx` just wrap old TSX?
3. Choose action:
   - **migrate** — pure UI, move into `.g.tsx`, add frames
   - **split** — mixed hooks+UI, separate scope from view
   - **descend** — orchestration, inspect children instead
   - **skip** — too risky or no visual surface
4. For `descend`: keep reading until finding real visual surfaces.
5. For `migrate`: move real UI + types + helpers into `.g.tsx`, add static frames, update imports.
6. For `split`: define `Scope` type, move production behavior behind `useRealScope`, wrap with `createGScopeHook`, render real TSX from `.g.tsx` component.
7. For provider-dependent UI, declare variants only when the provider has a meaningful finite environment axis, then mark coverage with `GProviderFrame`; keep provider values in `providers: [[Provider, value]]`.
8. Keep JSX-producing branches inspectable: direct conditionals over props/scope/providers, `if` returns, `&&`, `||`, and traceable `map`/render callbacks. Refactor helper predicates, `switch`, JSX-returning loops, and stored JSX variables before calling the refactor done.
9. Update imports from `./Component` to `./Component.g`. Preserve barrels.
10. Run `runelight check` + project typecheck. Render a frame in preview if available.

## Never

- `.g.tsx` that only renders `<ExistingComponent {...props} />`
- `<RunelightPreviewRuntime>` wrapping old clients
- `scope: { node: <OldComponent /> }`
- Runelight-ifying route/provider/layout orchestration
- Bulk-generating `*.impl.tsx` or `*.preview.g.tsx` files
- Preserving old paths by adding wrappers; update imports or use barrels
- Hiding JSX branch reachability behind helper predicates, `switch`, loops, or local JSX variables
- Marking provider variants when the provider is just arbitrary data instead of an environment axis

## Done When

- `.g.tsx` owns the migrated visual TSX
- Frames describe meaningful visual states, happy-path first
- Stateful frames use concrete scope data and no-op callbacks
- Old TSX no longer owns migrated visual branches
- `runelight check` passes
- Project typecheck passes, or unrelated failures are reported
