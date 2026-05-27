# gtsx Refactor Guide

Turn existing React TSX into production `.g.tsx` UI models.

Use this guide when a component already exists. For authoring patterns in the resulting `.g.tsx`, see the [Authoring Guide](./gtsx-authoring-guide.md). If the project isn't wired for gtsx yet, run the [`setup-gtsx`](../skill/setup-gtsx/SKILL.md) skill first.

## Invariant

`.g.tsx` owns real visual UI and enumerable visual states. It is not a preview wrapper around existing TSX.

If the visual UI cannot be safely moved into `.g.tsx`, skip that component. Never create a thin wrapper to show progress.

## Choosing Targets

Start from a user-visible visual surface, not from a file tree sweep.

Good targets own DOM, TSX, visual variants, or visible branches: loading, empty, error, overflow, open, selected, disabled, permission states.

Bad targets are orchestration: route glue, provider nesting, layout slots, feature composition, permission gates, data plumbing. Descend through them until you find real visual surfaces.

## Decision Gates

Before editing, answer four questions about the target:

1. Does it render real DOM/TSX (not only forwarding children, providers, or layout slots)?
2. Does it own a visual surface with states worth previewing?
3. Can those states be controlled by `props`, `scope`, and `providers`?
4. After migration, would the `.g.tsx` file just render the old component?

The answers determine the action:

| Action | When |
|--------|------|
| **migrate** | Mostly pure UI. Move into `.g.tsx`, add cases. |
| **split** | Mixes hooks/effects/router/stores with UI. Separate visual UI from production state. |
| **descend** | Orchestration. Don't convert; inspect children. |
| **skip** | Too risky or unclear. Leave untouched, no wrapper. |

If gate 4 is "yes" — you'd be creating a wrapper. Descend or skip instead.

## Migrate: Pure UI

The `.g.tsx` file becomes the production component:

1. Move component, UI prop types, helper render functions, and visual constants into `Component.g.tsx`.
2. Keep component name, props contract, and exports stable.
3. Add `Component.cases` with meaningful visual states.
4. Update imports from `./Component` to `./Component.g`.
5. Preserve public APIs through barrels:

```ts
export { Component } from "./Component.g"
```

## Split: Stateful UI

For components that mix hooks/effects/state with visual TSX:

1. Identify everything the TSX reads from hooks, effects, router, stores, or fetches.
2. Define a `Scope` type — only values and callbacks the visual UI needs.
3. Move production behavior into `useRealComponentScope(props)`.
4. Wrap: `const useComponentScope = createGScopeHook(useRealComponentScope)`.
5. The `.g.tsx` component calls only the gtsx hook and renders real TSX.
6. Add cases injecting `scope` for each important visual state.

```tsx
import { createGScopeHook, type GCases } from "gtsx"

type OrderProps = { orderId: string }

type OrderScope =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; title: string; total: string; submit: () => void }

function useRealOrderScope(props: OrderProps): OrderScope {
  // production: fetch order, manage submit state, handle errors
  void props
  return { status: "loading" }
}

const useOrderScope = createGScopeHook(useRealOrderScope)

export function Order(props: OrderProps) {
  const scope = useOrderScope(props)

  if (scope.status === "loading") {
    return <p>Loading order…</p>
  }
  if (scope.status === "error") {
    return <button onClick={scope.retry}>{scope.message}</button>
  }
  return (
    <article>
      <h1>{scope.title}</h1>
      <p>{scope.total}</p>
      <button onClick={scope.submit}>Submit</button>
    </article>
  )
}

Order.cases = {
  loading: {
    props: { orderId: "order_1" },
    scope: { status: "loading" },
  },
  ready: {
    props: { orderId: "order_1" },
    scope: { status: "ready", title: "Order #1001", total: "$42.00", submit() {} },
  },
  errorRetryable: {
    props: { orderId: "order_1" },
    scope: { status: "error", message: "Could not load order", retry() {} },
  },
} satisfies GCases<OrderProps, OrderScope>
```

Extract separate `.ts` modules only for shared business logic, reusable hooks, or service calls. Do not bulk-generate `*.impl.tsx` files as a migration escape hatch.

## Anti-Patterns

Never produce these as migrations:

```tsx
// Wrapper that doesn't own UI
export default function OrderPreview(props: OrderProps) {
  return <Order {...props} />
}

// Runtime wrapper instead of real component
export default function OrderPreview() {
  return <GtsxPreviewRuntime><OrderClient /></GtsxPreviewRuntime>
}

// Hiding old component behind a node scope value
type OrderScope = { node: React.ReactNode }
```

Also avoid:

- Converting route/provider/layout orchestration into `.g.tsx`
- Copying a parent into a child just to create a `.g.tsx` file
- Passing routers, query clients, stores, or entire payloads through scope (pass only what the view renders)
- Cases named `case1`, `test`, `withData` (name by visual state)
- Sweeping a directory and generating `.g.tsx` for every file

## Completion Standard

A refactor is done when:

- [ ] The `.g.tsx` file contains real visual UI, not a wrapper
- [ ] Export names and props contracts remain stable
- [ ] Local imports point at the `.g` module (or barrel re-exports it)
- [ ] Cases enumerate meaningful visual states (at least two, happy-path first)
- [ ] Stateful cases use concrete scope values and no-op callbacks
- [ ] The old TSX no longer owns the migrated visual branches
- [ ] `gtsx check` passes
- [ ] Project typecheck passes
- [ ] At least one case renders in Studio/preview (when available)

`gtsx check` validates protocol shape — it does not prove the refactor moved real UI. That remains a design judgment.
