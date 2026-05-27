---
name: refactor-to-gtsx
description: Refactor existing React TSX into production .g.tsx UI models without preview wrappers.
---

# Refactor Existing TSX To gtsx

Convert existing React components into `.g.tsx` UI models.

## Read First

- [Refactor Guide](../../docs/gtsx-refactor-guide.md) — decision gates, patterns, anti-patterns
- [Authoring Guide](../../docs/gtsx-authoring-guide.md) — best practices for the resulting `.g.tsx`
- [Authoring Reference](../authoring-gtsx/REFERENCE.md) — code patterns

If the project isn't wired for gtsx yet, run the `setup-gtsx` skill first.

## Invariant

`.g.tsx` owns real visual UI and enumerable visual states. Not a wrapper.

## Workflow

1. Inspect the target component and its tree.
2. Apply decision gates: does it render DOM? Own visual states? States controllable by props/scope/providers? Would `.g.tsx` just wrap old TSX?
3. Choose action:
   - **migrate** — pure UI, move into `.g.tsx`, add cases
   - **split** — mixed hooks+UI, separate scope from view
   - **descend** — orchestration, inspect children instead
   - **skip** — too risky or no visual surface
4. For `descend`: keep reading until finding real visual surfaces.
5. For `migrate`: move real UI + types + helpers into `.g.tsx`, add static cases, update imports.
6. For `split`: define `Scope` type, move production behavior behind `useRealScope`, wrap with `createGScopeHook`, render real TSX from `.g.tsx` component.
7. Update imports from `./Component` to `./Component.g`. Preserve barrels.
8. Run `gtsx check` + project typecheck. Render a case in Studio if available.

## Never

- `.g.tsx` that only renders `<ExistingComponent {...props} />`
- `<GtsxPreviewRuntime>` wrapping old clients
- `scope: { node: <OldComponent /> }`
- gtsx-ifying route/provider/layout orchestration
- Bulk-generating `*.impl.tsx` or `*.preview.g.tsx` files
- Preserving old paths by adding wrappers (update imports or use barrels)

## Done When

- `.g.tsx` owns the migrated visual TSX
- Cases describe meaningful visual states (happy-path first, at least two)
- Stateful cases: concrete scope data + no-op callbacks
- Old TSX no longer owns migrated visual branches
- `gtsx check` passes
- Project typecheck passes (or unrelated failures reported)
