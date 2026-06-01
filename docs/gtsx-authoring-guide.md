# gtsx Authoring Guide

Write `.g.tsx` components that own real visual UI, enumerate meaningful states, and pass `gtsx check`.

Start here for new gtsx components. If converting existing TSX, start with the [Refactor Guide](./gtsx-refactor-guide.md) then return here. If the project isn't wired for gtsx yet, run the [`setup-gtsx`](../skills/setup-gtsx/SKILL.md) skill first.

## What `.g.tsx` Is

A `.g.tsx` file is the UI model. It contains:

- Real visual TSX (not a wrapper around another component)
- Props and scope types that describe the UI surface
- Static `Component.cases` enumerating visual states
- Optionally: production hooks wrapped by `createGScopeHook`, providers created with `createGProvider`

The data flow:

```
props + provider context → gtsx scope → view
```

Cases inject at the scope seam. Preview renders any state without executing production hooks.

## Principles

1. **Author visual surfaces, not orchestration.** Route glue, provider nesting, layout slots, permission gates, and data plumbing belong outside `.g.tsx` unless they render meaningful visual surfaces.
2. **Model visual states through `props`, `scope`, and `providers`.** A case describes what the user sees.
3. **Scope is UI state and callbacks.** Not routers, query clients, stores, or hidden React nodes.
4. **Skip or descend when there's no visual surface.** Don't create `.g.tsx` to mirror project structure.

A thin wrapper is never a valid gtsx component:

```tsx
// This is NOT valid gtsx — the real UI lives elsewhere.
export default function BadgePreview(props: BadgeProps) {
  return <Badge {...props} />
}
```

## Pure Component

Every preview state described by props alone:

```tsx
import type { GCases } from "@gtsx/core"

type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.cases = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GCases<BadgeProps>
```

```sh
gtsx check src/Badge.g.tsx
# → gtsx pure entry: src/Badge.g.tsx
#   - neutral
#   - warning
```

## Stateful Component

Use `createGScopeHook` when the UI depends on application state:

```tsx
import { useState } from "react"
import { createGScopeHook, type GCases } from "@gtsx/core"

type CounterProps = { title: string }

type CounterScope = {
  count: number
  increment: () => void
}

function useRealCounterScope(): CounterScope {
  const [count, setCount] = useState(0)
  return { count, increment: () => setCount((v) => v + 1) }
}

const useCounterScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: CounterProps) {
  const scope = useCounterScope()

  return (
    <section>
      <h1>{props.title}</h1>
      <p>{scope.count}</p>
      <button type="button" onClick={scope.increment}>+</button>
    </section>
  )
}

Counter.cases = {
  zero: { props: { title: "Counter" }, scope: { count: 0, increment() {} } },
  five: { props: { title: "Counter" }, scope: { count: 5, increment() {} } },
} satisfies GCases<CounterProps, CounterScope>
```

```sh
gtsx check src/Counter.g.tsx
# → gtsx scope entry: src/Counter.g.tsx
#   - zero
#   - five
```

## Hook Boundary

Inside any `.g.tsx` component, call only gtsx hooks:

- `useGContext(Provider)` — read provider values
- Hooks from `createGScopeHook(useRealHook)` — read scope

Never call `useState`, `useEffect`, `useQuery`, or other React/library hooks directly in a `.g.tsx` component body. Production behavior lives inside the real hook, which `createGScopeHook` wraps:

```tsx
// ✗ Direct hook call in .g.tsx component
export default function Counter(props: CounterProps) {
  const [count] = useState(0) // violates hook boundary
  return <p>{props.title}: {count}</p>
}

// ✓ Wrapped through createGScopeHook
const useCounterScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: CounterProps) {
  const scope = useCounterScope()
  return <p>{props.title}: {scope.count}</p>
}
```

## Providers

Use `createGProvider` when cases need controlled context. If the provider has named environment states that Studio should expose, declare them as variants:

```tsx
import React from "react"
import { createGProvider, useGContext, type GCases, type GProviderCase } from "@gtsx/core"

type ThemeScope = { mode: "light" | "dark" }

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeScope>({ mode: "light" }),
  { variants: ["light", "dark"] as const },
)

type PanelProps = { title: string }

export default function Panel(props: PanelProps) {
  const theme = useGContext(ThemeProvider)
  return <section data-theme={theme.mode}>{props.title}</section>
}

Panel.cases = {
  light: {
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "light" }]],
  } satisfies GProviderCase<typeof ThemeProvider, "light", PanelProps, never, [typeof ThemeProvider]>,
  dark: {
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "dark" }]],
  } satisfies GProviderCase<typeof ThemeProvider, "dark", PanelProps, never, [typeof ThemeProvider]>,
} satisfies GCases<PanelProps, never, [typeof ThemeProvider]>
```

`createGProvider(useValue)` follows the `react-tracked` model: the Provider owns state and update, `useGContext(Provider)` reads tracked state, `useGContextUpdate(Provider)` reads the update function.

Variants are optional. Use them only when the provider represents a meaningful environment axis such as theme, sign-in state, role, locale, or platform. Omit `variants` for providers that merely pass arbitrary data.

`GProviderCase` is a static marker. It does not inject provider state by itself; `providers: [[Provider, value]]` still supplies the preview context value. Keep the marker and value aligned when the component reads that provider. A case that is orthogonal to the environment axis can remain unmarked, and Studio will treat it as neutral. A case that intentionally covers multiple provider variants can mark a union such as `GProviderCase<typeof UserSignProvider, "login" | "anonymous">`.

You can also use `GProviderCase` on a child that does not read the provider directly when its props are a projection of that environment:

```tsx
AccountName.cases = {
  loginName: {
    props: { userName: "Ada" },
  } satisfies GProviderCase<typeof UserSignProvider, "login", AccountNameProps>,
  anonymousName: {
    props: { userName: "Guest" },
  } satisfies GProviderCase<typeof UserSignProvider, "anonymous", AccountNameProps>,
} satisfies GCases<AccountNameProps>
```

If a component consumes a provider with declared variants through `useGContext(Provider)` or a `createGScopeHook(..., [Provider])`, its cases must cover every declared variant.

Projection markers on a child do not replace the consuming parent's coverage. If the parent reads `UserSignProvider` and passes derived props into `AccountName`, the parent still needs cases covering the provider variants. If the child receives provider-derived props but has no matching `GProviderCase` markers, `gtsx check` reports a warning so an agent can decide whether the child is an environment projection or just a neutral props-only component.

## JSX Branches

If `props`, gtsx scope, or gtsx provider context decides whether JSX renders, write that branch so `gtsx check` can trace it back to those values.

Good first-order branch shapes:

```tsx
return props.open ? <Panel /> : null

if (scope.status === "ready") return <Panel />

return props.items.map((item) => (item.visible ? <Row item={item} /> : null))
```

Avoid hiding JSX reachability behind helper predicates, `switch`, loops that return JSX, or local variables that store JSX. Those are valid React, but not inspectable gtsx protocol shape; `gtsx check` reports them as opaque control flow.

## Cases

Cases are static object literals attached to the component export.

**Structure:**

```tsx
// Pure
Badge.cases = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
} satisfies GCases<BadgeProps>

// Stateful
Counter.cases = {
  zero: { props: { title: "Counter" }, scope: { count: 0, increment() {} } },
} satisfies GCases<CounterProps, CounterScope>

// Contextual
Panel.cases = {
  light: { props: { title: "Panel" }, providers: [[ThemeProvider, { mode: "light" }]] },
} satisfies GCases<PanelProps, never, [typeof ThemeProvider]>
```

**Naming:** cases describe visual states, not implementation details.

| Component kind | Good names |
|---------------|------------|
| Basic UI | `default`, `disabled`, `danger`, `open`, `selected`, `longLabel`, `withIcon` |
| Composite | `empty`, `populated`, `overflowing`, `permissionDenied` |
| Page/feature | `loading`, `errorRetryable`, `ready`, `empty`, `unauthorized` |

**Rules:**

- Put the happy-path case first.
- Use at least two cases unless the component truly has one stable visual state.
- No computed keys, dynamic generation, or async loading.
- No secrets, credentials, or customer data.
- Provide no-op functions for callbacks: `increment() {}`.

## Exports and Coordinates

A `.g.tsx` file exports one or more components. Each has a coordinate:

```txt
src/MultiExport.g.tsx#default
src/MultiExport.g.tsx#NamedBadge
```

Bare file paths check all exports. Explicit coordinates target one component.

## File Organization

- Keep prop/scope types in the `.g.tsx` file unless shared across multiple components.
- Extract separate `.ts` files only for shared business logic, data helpers, or service calls.
- When migrating, update imports to the `.g` module. Preserve public APIs through barrel re-exports:

```ts
export { Badge } from "./Badge.g"
```

## Verification

```sh
gtsx check src/Counter.g.tsx    # single file
gtsx check src                  # directory
```

| Diagnostic | Fix |
|-----------|-----|
| `missing-cases` | Add `Component.cases = { ... } satisfies GCases<…>` |
| `non-static-case-key` | Use literal case keys |
| `non-gtsx-hook` | Wrap hook with `createGScopeHook`, call only the returned gtsx hook |
| `scope-hook-cases-unsupported` | Move `.cases` from the scope hook to the component export |
| `missing-provider-variant-cases` | Add cases marked with `GProviderCase` for every consumed provider variant |
| `missing-provider-variants` | Add `variants: [...]` to the provider or remove the `GProviderCase` marker |
| `unknown-provider-variant` | Use one of the provider's declared variants |
| `unmarked-provider-variant-projection` | Warning: inspect whether provider-derived child props need projected `GProviderCase` markers |
| `opaque-jsx-control-flow` | Rewrite JSX-producing branches as direct props/scope/context expressions |
| `unknown-jsx-branch-coverage` | Inline the case values that affect JSX reachability; avoid helper variables or spread there |
| `uncovered-jsx-branch` | Add a case whose props, scope, or provider values make that JSX branch reachable |

`gtsx check` diagnostics are errors: any diagnostic makes the command exit non-zero. It validates protocol shape and branch reachability. It does not prove that the file owns real UI or that cases are meaningful — that remains a design judgment.

## Examples

- Pure props: [`examples/src/cases/language/PrimitiveProps.g.tsx`](../examples/src/cases/language/PrimitiveProps.g.tsx)
- Stateful scope: [`examples/src/cases/stateful/NotificationBell.g.tsx`](../examples/src/cases/stateful/NotificationBell.g.tsx)
- Provider context: [`packages/gtsx/test/fixtures/check-project/src/UserCard.g.tsx`](../packages/gtsx/test/fixtures/check-project/src/UserCard.g.tsx)
