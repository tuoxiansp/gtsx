---
name: refactor-to-runelight-react
description: Refactor existing React TSX into production .g.tsx UI models without preview wrappers.
---

# Refactor Existing React TSX To Runelight

Convert existing React components into `.g.tsx` UI models.

## Read First

- This skill owns the React refactor workflow and decision gates.
- For concrete `.g.tsx` writing patterns, route to `authoring-runelight-react` and read [Authoring Reference](../authoring-runelight-react/REFERENCE.md).

If the project isn't wired for Runelight yet, follow the Runelight setup playbook first.

## Invariant

`.g.tsx` owns real visual UI and enumerable visual states. Not a wrapper.

## North Star

React UI can always move toward Runelight coverage. If the current file cannot be migrated directly, the real visual surface, state seam, or inspectable branch shape has not been exposed yet. Your job is to expose it.

## Migration Bias

When the user asks to migrate an app, screen, or set of React components, do not frame the task as finding components "suitable for Runelight." Runelight refactor is not a suitability filter over the file tree. Treat user-visible React UI as migratable until inspection proves otherwise, then choose the refactor move that exposes the real visual surface:

- **migrate** when props already describe the view
- **split** when hooks, effects, queries, stores, routers, or local state feed the view
- **descend** when the current file is orchestration and real visual DOM lives in children
- **extract** when a route, server component, or container mixes non-previewable work with visual JSX; move the visual JSX behind props/scope in a `.g.tsx` component
- **normalize** when legal React control flow hides branch reachability from `runelight check`; rewrite it into direct props/scope/provider expressions
- **defer** only after recording the concrete blocker and what information would unblock migration

`skip` is not a first-pass category for "complex" React. Hooks, context, async data, server work, feature flags, provider-dependent rendering, helper predicates, `switch`, stored JSX, and JSX-producing loops are reasons to split, create scope, declare providers, descend, extract, or normalize. Skip only when there is no owned visual surface after descent, the component's real public contract is non-visual, or the required behavior cannot be represented without adding a wrapper/runtime shell/product-boundary change.

## Workflow

1. Inspect the target component and its tree. Gather the information needed to migrate: rendered DOM/TSX, prop contract, branch inputs, hook/query/store/router reads, context/provider reads, callbacks, CSS/static assets, child visual surfaces, and import boundaries.
   - For JSX-valued props, `children`, render props, icons, actions, or slots, trace the real production values. Decide whether they are the component's public visual contract or evidence that the chosen entry is too high-level.
2. Apply decision gates: does it render DOM? Own visual states? Which inputs control those states? Would `.g.tsx` just wrap old TSX?
3. Choose action:
   - **migrate** — pure UI, move into `.g.tsx`, add frames
   - **split** — mixed hooks+UI, separate scope from view
   - **descend** — orchestration, inspect children instead
   - **extract** — route/server/container file owns visual JSX but also non-previewable work; extract the view into `.g.tsx` and leave production work as caller/scope
   - **normalize** — legal React render logic is too opaque for static branch coverage; rewrite it into inspectable expressions before adding frames
   - **defer** — no visual surface or a concrete blocker remains after migrate/split/descend/extract/normalize are considered
4. For `descend`: keep reading until finding real visual surfaces.
5. For `migrate`: move real UI + types + helpers into `.g.tsx`, add static frames, update imports.
6. For `split`: define `Scope` type, move production behavior behind `useRealScope`, wrap with `createGScopeHook`, render real TSX from `.g.tsx` component.
7. For `extract`: keep fetches, mutations, server APIs, route params, and production-only providers outside the `.g.tsx` view; pass their visible results through props or scope.
8. For `normalize`: preserve behavior while exposing branch reachability as direct conditionals over props, scope, providers, or static const facts.
9. For provider-dependent UI, declare variants only when the provider has a meaningful finite environment axis, then mark coverage with `GProviderFrame`; keep provider values in `providers: [[Provider, value]]`.
10. For JSX-valued props/slots that remain part of the `.g.tsx` public contract, write representative frame fixtures. Use real pure child components, imported design-system pieces, or local static fixtures that preserve the production density, hierarchy, labels, controls, and edge state. Do not use trivial placeholder nodes to stand in for the primary surface.
11. If most of the preview would be a fake slot fixture, the migration target is wrong: descend to the child visual surface, extract the real JSX into the `.g.tsx`, or defer with the concrete runtime blocker.
12. Keep JSX-producing branches inspectable: direct conditionals over props/scope/providers, `if` returns, `&&`, `||`, and traceable `map`/render callbacks. Refactor helper predicates, `switch`, JSX-returning loops, and stored JSX variables before calling the refactor done.
13. Update imports from `./Component` to `./Component.g`. Preserve barrels.
14. Run `runelight check` + project typecheck. Render a frame in preview if available.

For project-wide migration requests, keep a short migration inventory: target surface, chosen action (`migrate`, `split`, `descend`, `extract`, `normalize`, or `defer`), created `.g.tsx` coordinate, important frames, verification status, and any deferred blocker. The inventory is for coverage planning; do not bulk-generate `.g.tsx` files from it.

## Never

- `.g.tsx` that only renders `<ExistingComponent {...props} />`
- `<RunelightPreviewRuntime>` wrapping old clients
- `scope: { node: <OldComponent /> }`
- Trivial slot mocks such as `children: <div>Content</div>` or `actions: <div />` when that slot determines the visual value of the preview
- Runelight-ifying route/provider/layout orchestration
- Bulk-generating `*.impl.tsx` or `*.preview.g.tsx` files
- Preserving old paths by adding wrappers; update imports or use barrels
- Hiding JSX branch reachability behind helper predicates, `switch`, loops, or local JSX variables
- Marking provider variants when the provider is just arbitrary data instead of an environment axis
- Reporting "not suitable for Runelight" without naming the concrete visual-surface, scope/provider, static-inspectability, or product-boundary blocker
- Ending with "not suitable" instead of a migration action, normalization step, or deferred blocker

## Done When

- `.g.tsx` owns the migrated visual TSX
- Frames describe meaningful visual states, happy-path first
- Stateful frames use concrete scope data and no-op callbacks
- JSX-valued frame props/children/render props use representative visual fixtures, not placeholder divs
- Old TSX no longer owns migrated visual branches
- Deferred targets, if any, name a concrete blocker and next information needed instead of using suitability language
- `runelight check` passes
- Project typecheck passes, or unrelated failures are reported
