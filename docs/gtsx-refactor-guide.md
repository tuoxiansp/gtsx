# GTSX Refactor Guide

This guide shows how to turn existing React TSX into production `.g.tsx` UI models.

Use this guide when a component already exists in a target project. Use the [GTSX Authoring Guide](./gtsx-authoring-guide.md) for best practices while writing the resulting `.g.tsx` component. If the project has not been wired for GTSX Studio and preview yet, first use the [Studio Installer Prompt](./gtsx-studio-installer-prompt.md).

## Core Invariant

`.g.tsx` owns real visual UI and enumerable visual states. It is not a preview wrapper around existing TSX.

If the visual UI cannot be safely moved into `.g.tsx`, skip that component. Do not create a thin wrapper to show progress.

## Refactor Targets

Start from a user-visible visual surface, not from a file tree sweep. Good targets are components that own DOM, JSX, visual variants, or other visible branches such as loading, empty, error, overflow, open, selected, disabled, and permission states.

Do not GTSX-ify orchestration. A component is usually not a refactor target when it mainly does route glue, provider nesting, layout slots, feature composition, permission gates, or data plumbing. Descend through those components until you find the first component with a real visual surface whose visual variations can be meaningfully enumerated as cases.

Case names depend on the component kind:

- Basic UI: `default`, `disabled`, `danger`, `open`, `selected`, `longLabel`, `withIcon`.
- Composite UI: `empty`, `populated`, `overflowing`, `permissionDenied`.
- Page or feature UI: `loading`, `errorRetryable`, `ready`, `empty`, `unauthorized`.

## Decision Gates

Before editing, inspect the target component and answer these gates:

1. Does this component render real DOM or JSX instead of only forwarding children, providers, routes, or layout slots?
2. Does it own a visual surface with states or variants worth previewing?
3. Can those states be controlled by `props`, `scope`, and `providers`?
4. After migration, would the `.g.tsx` file still just render the old TSX component?

Use the result to choose an action:

- `migrate`: the component is mostly pure UI. Move it into `.g.tsx` and add cases.
- `split`: the component mixes hooks, effects, router, stores, fetches, or other production behavior with UI. Move the visual UI into `.g.tsx` and put production behavior behind a real scope hook.
- `descend`: the component is orchestration. Do not convert it; inspect its children.
- `skip`: the component is too risky or unclear. Leave it untouched and do not create a `.g.tsx` wrapper.

If gate 4 is yes, do not migrate at that boundary. Descend into the old component or skip it.

## Pure UI Migration

For a pure component, make the `.g.tsx` file the production component:

1. Move the component, UI prop types, helper render functions, and local visual constants into `Component.g.tsx`.
2. Keep the component name, props contract, and default or named exports stable where practical.
3. Add static `Component.cases` with meaningful visual states.
4. Update local imports from `./Component` to `./Component.g`.
5. Keep barrel exports stable when a package or directory exposes a public API:

```ts
export { Component } from "./Component.g"
```

Do not create a wrapper just to preserve an old relative path.

## Stateful Or Heavy Migration

Heavy components are normal GTSX targets. Do not avoid them by wrapping the old component. Apply this mechanical split:

1. Identify everything the JSX reads from hooks, effects, router, query clients, stores, fetches, local state, or permissions.
2. Define a `Scope` type containing only the values and callbacks the visual UI needs.
3. Move production behavior into `useRealComponentScope(props)`.
4. Wrap that hook with `createGScopeHook(useRealComponentScope)`.
5. Make the exported `.g.tsx` component call only the returned GTSX hook and render the real JSX.
6. Add cases that inject `scope` for the important visual states.

```tsx
import { createGScopeHook, type GCases } from "gtsx"

type OrderProps = {
  orderId: string
}

type OrderScope =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; title: string; total: string; submit: () => void }

function useRealOrderScope(props: OrderProps): OrderScope {
  void props
  return { status: "loading" }
}

const useOrderScope = createGScopeHook(useRealOrderScope)

export function Order(props: OrderProps) {
  const scope = useOrderScope(props)

  if (scope.status === "loading") {
    return <p>Loading order...</p>
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

Extract ordinary `.ts` or `.tsx` modules only for shared non-UI code, large data helpers, service calls, reusable hooks, or actions. Do not bulk-generate `*.impl.tsx` files as a migration escape hatch.

## Anti-Patterns

Do not produce these as component migrations:

```tsx
export default function OrderPreview(props: OrderProps) {
  return <Order {...props} />
}
```

```tsx
export default function OrderPreview() {
  return (
    <GtsxPreviewRuntime>
      <OrderClient />
    </GtsxPreviewRuntime>
  )
}
```

```tsx
type OrderScope = {
  node: React.ReactNode
}
```

A `ReactNode` prop or scope value is acceptable only when the component's real public contract is a slot. It is not acceptable as an escape hatch for hiding the old component behind `scope.node`.

Also avoid:

- Converting route, provider, or layout orchestration into `.g.tsx`.
- Copying a parent component into a nearly identical child just to create a `.g.tsx` file.
- Passing router objects, query clients, stores, API clients, or entire payloads through scope when the UI needs only selected render values and callbacks.
- Creating cases named `case1`, `test`, or `withData` when the state can be named visually.
- Sweeping an entire directory and generating `.g.tsx` files for every `*-client.tsx`.

## Completion Standard

A GTSX refactor is complete only when:

- The `.g.tsx` file contains the real visual UI model, not only a wrapper around old TSX.
- Export names and props contracts remain stable where practical.
- Local production imports point at the `.g` module, or a barrel re-exports the `.g` module as the stable public API.
- Cases enumerate meaningful visual states. Use at least two cases unless the component truly has only one stable visual state.
- Stateful cases inject concrete UI scope values and callbacks, not `scope.node` placeholders.
- The old TSX no longer owns the migrated visual branches.
- `gtsx check` passes for the new `.g.tsx` file or scope.
- The target project's normal typecheck passes.
- When Studio or preview is available, at least one migrated case renders successfully.

`gtsx check` is necessary but not sufficient. It verifies protocol shape; it does not prove that the refactor moved real UI into `.g.tsx`.
