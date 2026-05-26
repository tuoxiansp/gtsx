---
name: refactor-to-gtsx
description: Refactor existing React TSX components into production .g.tsx UI models without preview wrappers.
---

# Refactor Existing TSX To GTSX

Use this skill when converting, migrating, or refactoring existing React `.tsx` components into GTSX.

## Read First

- Repository guide: `../../docs/gtsx-refactor-guide.md`
- Authoring best practices: `../../docs/gtsx-authoring-guide.md`
- Authoring patterns: `../authoring-gtsx/REFERENCE.md`

If the target project is not wired for GTSX Studio or preview yet, use the Studio installer prompt first instead of migrating components.

## Core invariant

`.g.tsx` owns real visual UI and enumerable visual states. It is not a preview wrapper around existing TSX.

If the visual UI cannot be safely moved into `.g.tsx`, skip that component. Do not create a thin wrapper to show progress.

## Workflow

1. Inspect the requested surface and nearby component tree.
2. Apply the decision gates from the repository refactor guide.
3. Choose `migrate`, `split`, `descend`, or `skip`.
4. For `descend`, keep reading until you find a component with a real visual surface whose visual variations can be expressed as cases.
5. For `migrate`, move the real UI, UI prop types, and visual helpers into `.g.tsx`; add static cases.
6. For `split`, define a UI `Scope`, move production hooks/effects/router/store/fetch behavior behind `useRealScope`, wrap it with `createGScopeHook`, and render the real JSX from the `.g.tsx` component.
7. Update local imports from `./Component` to `./Component.g`; keep component names, props contracts, and public barrel exports stable where practical.
8. Run `gtsx check` and the target project's normal typecheck. If Studio or preview is available, render at least one migrated case.

## Never Do This

- Do not create `.g.tsx` files that only render `<ExistingComponent {...props} />`.
- Do not wrap old clients in `<GtsxPreviewRuntime>` and call that a component migration.
- Do not hide the old component behind `scope: { node: <OldComponent /> }`.
- Do not GTSX-ify route, provider, layout, or feature orchestration.
- Do not bulk-generate `*.impl.tsx`, `*.component.g.tsx`, or `*.preview.g.tsx` files to avoid moving UI.
- Do not preserve old relative import paths by adding wrappers. Update imports to `.g` or use a barrel re-export.

## Completion Check

Before finishing, confirm:

- The `.g.tsx` file owns the migrated visual JSX and visual branches.
- Cases describe meaningful visual states.
- The happy-path case appears first when the component has one.
- Stateful cases use concrete scope data and no-op callbacks.
- The old TSX no longer owns the migrated visual branches.
- `gtsx check` passes.
- The project typecheck passes or any failure is clearly unrelated and reported.
