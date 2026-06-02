# gtsx Refactor Guide

Turn existing React TSX into production `.g.tsx` UI models.

Use this guide when a component already exists. For authoring patterns in the resulting `.g.tsx`, see the [Authoring Guide](./gtsx-authoring-guide.md). If the project isn't wired for gtsx yet, run the [`setup-gtsx`](../skills/setup-gtsx/SKILL.md) skill first.

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

If the UI reads context through `useGContext(Provider)` or through a scope hook that depends on provider values, decide whether that provider has a meaningful finite environment axis. For axes such as auth state, role, theme, locale, or platform, declare provider variants and mark cases with `GProviderCase`. Omit variants when the provider only carries arbitrary data.

Keep JSX-producing branches inspectable while splitting. Direct `if` returns, ternaries, `&&`, `||`, and traceable collection callbacks are valid gtsx shape. Helper predicates, `switch`, JSX-returning loops, and local variables that store JSX hide reachability from `gtsx check`; refactor them before considering the migration complete.

```tsx
import { createGScopeHook, type GCases } from "@gtsx/core"

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

## Split: Server Components

Server Components often mix request-time work with visual JSX. Do not try to preview the server work. Split the visual surface into a `.g.tsx` export that can run in the client preview graph, and keep request APIs in the server entry.

Before:

```tsx
// Profile.tsx
import "server-only"
import { cookies } from "next/headers"

export default async function Profile() {
  const cookieStore = await cookies()
  const user = await loadUser(cookieStore)
  return <main>{user.name}</main>
}
```

After:

```tsx
// Profile.tsx
import { cookies } from "next/headers"
import { ProfileView } from "./ProfileView.g"

export default async function Profile() {
  const cookieStore = await cookies()
  const user = await loadUser(cookieStore)
  return <ProfileView userName={user.name} />
}
```

```tsx
// ProfileView.g.tsx
import "server-only"
import type { GCases } from "@gtsx/core"

type ProfileViewProps = {
  userName: string
}

export function ProfileView(props: ProfileViewProps) {
  return <main>{props.userName}</main>
}

ProfileView.cases = {
  ready: { props: { userName: "Ada" } },
} satisfies GCases<ProfileViewProps>
```

The preview transform removes preview-only blockers such as a top-level `"use server"` directive, nested server action directives, `"use cache..."` cache directives, and `import "server-only"` marker imports. It does not remove real server APIs such as `next/headers`, database clients, filesystem access, or secrets. If those are still imported by the `.g.tsx` visual module, the client preview should fail; move that work back behind props, scope, or providers.

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
- Hiding JSX reachability behind helper predicates, `switch`, JSX-returning loops, or local JSX variables
- Marking provider variants just because a provider exists; variants should represent a useful environment axis

## Completion Standard

A refactor is done when:

- [ ] The `.g.tsx` file contains real visual UI, not a wrapper
- [ ] Export names and props contracts remain stable
- [ ] Local imports point at the `.g` module (or barrel re-exports it)
- [ ] Cases enumerate meaningful visual states (at least two, happy-path first)
- [ ] Consumed provider variants are declared and covered, when the provider has a meaningful finite axis
- [ ] Stateful cases use concrete scope values and no-op callbacks
- [ ] The old TSX no longer owns the migrated visual branches
- [ ] `gtsx check` passes
- [ ] Project typecheck passes
- [ ] At least one case renders in Studio/preview (when available)

`gtsx check` validates protocol shape and catches unreachable, unknown, or opaque JSX branches. It still does not prove the refactor moved the right UI or chose meaningful cases — that remains a design judgment.
