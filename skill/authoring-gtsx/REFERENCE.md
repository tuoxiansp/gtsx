# GTSX Authoring Reference

## Pattern 1: Pure Props

The simplest kind. Every preview state is described entirely by props.

```tsx
import type { GCases } from "gtsx"

type AlertProps = {
  severity: "info" | "warning" | "error"
  message: string
  dismissible: boolean
}

export default function Alert(props: AlertProps) {
  return (
    <div data-severity={props.severity}>
      <p>{props.message}</p>
      {props.dismissible && <button>Dismiss</button>}
    </div>
  )
}

Alert.cases = {
  info: {
    props: { severity: "info", message: "Saved.", dismissible: true },
  },
  errorNonDismissible: {
    props: { severity: "error", message: "Connection lost.", dismissible: false },
  },
} satisfies GCases<AlertProps>
```

## Pattern 2: Stateful Scope (createGScopeHook)

Use when the component depends on application state (hooks, stores, queries, routers).

```tsx
import { useState } from "react"
import { createGScopeHook, type GCases } from "gtsx"

type SearchProps = { placeholder: string }

type SearchScope = {
  query: string
  results: string[]
  onSearch: (q: string) => void
}

function useRealSearchScope(): SearchScope {
  const [query, setQuery] = useState("")
  // production logic: fetch, debounce, etc.
  return { query, results: [], onSearch: setQuery }
}

const useSearchScope = createGScopeHook(useRealSearchScope)

export default function Search(props: SearchProps) {
  const scope = useSearchScope()

  return (
    <div>
      <input placeholder={props.placeholder} value={scope.query} onChange={(e) => scope.onSearch(e.target.value)} />
      <ul>
        {scope.results.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  )
}

Search.cases = {
  empty: {
    props: { placeholder: "Search…" },
    scope: { query: "", results: [], onSearch() {} },
  },
  withResults: {
    props: { placeholder: "Search…" },
    scope: { query: "react", results: ["React", "React Native"], onSearch() {} },
  },
} satisfies GCases<SearchProps, SearchScope>
```

Key points:
- The real hook (`useRealSearchScope`) can call any React hooks.
- `createGScopeHook(useRealHook)` returns a GTSX hook that the component calls.
- Cases supply `scope` values, bypassing the real hook during preview.

## Pattern 3: Discriminated Union Scope

Model multi-state components with a discriminated union. Each case represents one branch.

```tsx
import { createGScopeHook, type GCases } from "gtsx"

type Props = { resourceId: string }

type Scope =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; title: string; data: number[] }

function useRealScope(_props: Props): Scope {
  return { status: "loading" }
}

const useScope = createGScopeHook(useRealScope)

export default function Resource(props: Props) {
  const scope = useScope(props)

  switch (scope.status) {
    case "loading":
      return <p>Loading {props.resourceId}…</p>
    case "error":
      return <div><p>{scope.message}</p><button onClick={scope.retry}>Retry</button></div>
    case "ready":
      return <div><h1>{scope.title}</h1><p>{scope.data.length} items</p></div>
  }
}

Resource.cases = {
  loading: {
    props: { resourceId: "res_1" },
    scope: { status: "loading" },
  },
  error: {
    props: { resourceId: "res_1" },
    scope: { status: "error", message: "Timeout", retry() {} },
  },
  ready: {
    props: { resourceId: "res_1" },
    scope: { status: "ready", title: "Dashboard", data: [1, 2, 3] },
  },
} satisfies GCases<Props, Scope>
```

## Pattern 4: Provider Context (useGContext)

Use when the component reads from a shared context (theme, locale, auth, feature flags).

```tsx
import React from "react"
import { createGProvider, useGContext, type GCases } from "gtsx"

type ThemeValue = { mode: "light" | "dark"; accent: string }

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeValue>({ mode: "light", accent: "#0066cc" }),
)

type CardProps = { title: string }

export default function Card(props: CardProps) {
  const theme = useGContext(ThemeProvider)
  return <div data-mode={theme.mode} style={{ color: theme.accent }}>{props.title}</div>
}

Card.cases = {
  lightCard: {
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "light", accent: "#0066cc" }]],
  },
  darkCard: {
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "dark", accent: "#66ccff" }]],
  },
} satisfies GCases<CardProps, never, [typeof ThemeProvider]>
```

Key points:
- Providers are created with `createGProvider(useValue)`.
- Component cases provide preview fallback state with ordered entries: `providers: [[Provider, state]]`.
- The third type parameter of `GCases` lists providers as a tuple.

## Pattern 5: Multiple Exports

A single `.g.tsx` file can export multiple components. Each gets its own coordinate.

```tsx
import type { GCases } from "gtsx"

type ButtonProps = { label: string; variant: "primary" | "ghost" }

export function PrimaryButton(props: ButtonProps) {
  return <button className="primary">{props.label}</button>
}

PrimaryButton.cases = {
  ready: { props: { label: "Submit", variant: "primary" } },
} satisfies GCases<ButtonProps>

export default function GhostButton(props: ButtonProps) {
  return <button className="ghost">{props.label}</button>
}

GhostButton.cases = {
  ready: { props: { label: "Cancel", variant: "ghost" } },
} satisfies GCases<ButtonProps>
```

Coordinates: `src/Buttons.g.tsx#default`, `src/Buttons.g.tsx#PrimaryButton`.

## Pattern 6: Scope with Props Dependency

The scope hook can accept props as an argument when the state depends on prop values.

```tsx
import { createGScopeHook, type GCases } from "gtsx"

type Props = { userId: string }
type Scope = { name: string; online: boolean }

function useRealScope(props: Props): Scope {
  // fetch user by props.userId
  return { name: "Loading…", online: false }
}

const useScope = createGScopeHook(useRealScope)

export default function UserStatus(props: Props) {
  const scope = useScope(props)
  return <span>{scope.name} ({scope.online ? "online" : "offline"})</span>
}

UserStatus.cases = {
  online:  { props: { userId: "u1" }, scope: { name: "Ada", online: true } },
  offline: { props: { userId: "u2" }, scope: { name: "Bob", online: false } },
} satisfies GCases<Props, Scope>
```

## Pattern 7: Scope + Provider Combined

When a component has both internal state and external context.

```tsx
import React from "react"
import { createGProvider, createGScopeHook, type GCases } from "gtsx"

type AuthValue = { role: "admin" | "viewer" }

const AuthProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<AuthValue>({ role: "viewer" }),
)

const providers = [AuthProvider] as const

type Props = { pageId: string }
type Scope = { title: string; canEdit: boolean }

function useRealScope(_props: Props, [auth]: [AuthValue]): Scope {
  void auth
  return { title: "Loading…", canEdit: false }
}

const useScope = createGScopeHook(useRealScope, providers)

export default function Page(props: Props) {
  const scope = useScope(props)

  return (
    <article>
      <h1>{scope.title}</h1>
      {scope.canEdit && <button>Edit</button>}
    </article>
  )
}

Page.cases = {
  adminView: {
    props: { pageId: "p1" },
    providers: [[AuthProvider, { role: "admin" }]],
    scope: { title: "Dashboard", canEdit: true },
  },
  viewerView: {
    props: { pageId: "p1" },
    providers: [[AuthProvider, { role: "viewer" }]],
    scope: { title: "Dashboard", canEdit: false },
  },
} satisfies GCases<Props, Scope, typeof providers>
```

## Case Design Guidelines

### Name cases by visual/behavioral state, not by data

```tsx
// Good: describes what the user sees
cases = { empty: {…}, loading: {…}, overflowing: {…}, errorRetryable: {…} }

// Bad: describes implementation details
cases = { case1: {…}, withData: {…}, testCase: {…} }
```

### Cover boundary states

For any component, consider these case categories:
- **Happy path** — typical usage with representative data
- **Empty** — no data, zero counts, blank strings
- **Loading** — async pending states
- **Error** — failure with recovery options
- **Overflow** — long text, large lists, many items
- **Edge** — disabled, readonly, first-use, permission-denied

### Keep case data minimal but realistic

```tsx
// Good: minimal realistic fixture
scope: { status: "ready", name: "Ada Lovelace", role: "Engineer" }

// Bad: lorem ipsum or obviously fake data
scope: { status: "ready", name: "asdfasdf", role: "xxx" }
```

### Functions in scope

Provide no-op functions (`() => {}`) for callbacks in cases. They satisfy the type without side effects.

```tsx
scope: { count: 0, increment() {}, reset() {} }
```

## File Organization

- One primary component per `.g.tsx` file (default export).
- Co-locate the provider with the component if it's only used by that component.
- Share providers across files by exporting from a dedicated `providers.g.tsx`.
- Keep prop/scope types in the same `.g.tsx` file unless shared across multiple components.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Calling `useState` directly in component body | Wrap in `createGScopeHook` |
| Putting `.cases` on the scope hook | Move to the component export |
| Using template literals as case keys | Use plain string literal keys |
| Forgetting `satisfies GCases<…>` | Always add for type safety |
| Importing from `"gtsx/runtime"` | Import from `"gtsx"` |
| Making cases depend on runtime values | Cases must be statically evaluable |
