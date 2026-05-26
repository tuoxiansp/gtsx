# GTSX Authoring Guide

This is a best-practices guide, not just an API reference. Use it to decide what belongs in `.g.tsx`, how to model visual states, and how to avoid `.g.tsx` files that pass `gtsx check` but do not own real UI.

Start here when writing a new GTSX component or improving an existing `.g.tsx` file. If you are converting existing TSX into GTSX, start with the [GTSX Refactor Guide](./gtsx-refactor-guide.md), then use this guide while authoring the resulting `.g.tsx` component. If the target project has not been wired for GTSX preview and Studio yet, first give the official [Studio Installer Prompt](./gtsx-studio-installer-prompt.md) to an AI coding agent inside that project.

This guide covers authoring best practices. It does not replace the agent-driven installation flow or the existing-TSX refactor workflow.

## What `gtsx check` Validates

`gtsx check` validates the GTSX contract inside `.g.tsx` files: component exports, statically enumerable `Component.cases`, pure versus scope cases, provider entries, and the GTSX hook boundary.

It does not replace TypeScript. Prop types, scope types, JSX types, imports, and ordinary TypeScript errors remain the TypeScript compiler's job. Run the target project's normal typecheck alongside `gtsx check`.

## Core Authoring Principles

`.g.tsx` is the UI model. It should own real visual JSX and enumerable visual states, not act as a preview wrapper around an existing TSX component.

Good GTSX authoring follows these principles:

- Author visual surfaces, not orchestration. Route glue, provider nesting, layout slots, permission gates, and data plumbing usually belong outside `.g.tsx` unless they render their own meaningful visual surface.
- Model visual states through `props`, `scope`, and `providers`. A case should describe what the user can see.
- Use `scope` for UI state and event callbacks, not for entire routers, query clients, stores, API clients, or hidden React nodes.
- Prefer a real state model over `scope: { node: <Something /> }`. A React node is appropriate only when slots are the component's actual public contract.
- Skip or descend when a component has no independent visual surface. Do not create a `.g.tsx` file just to mirror the project structure.

Thin wrappers are not successful GTSX components:

```tsx
export default function BadgePreview(props: BadgeProps) {
  return <Badge {...props} />
}
```

If the real visual UI remains in `Badge.tsx`, this is only a wrapper, even if `gtsx check` passes.

## Quickstart: Pure UI

Use a pure `.g.tsx` component when every preview state can be described with props.

```tsx
import type { GCases } from "gtsx"

type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.cases = {
  neutral: {
    props: { tone: "neutral", label: "Ready" },
  },
  warning: {
    props: { tone: "warning", label: "Needs review" },
  },
} satisfies GCases<BadgeProps>
```

Check it with:

```sh
gtsx check src/Badge.g.tsx
```

Expected result:

```txt
GTSX pure entry: src/Badge.g.tsx
- neutral
- warning
```

## Quickstart: Stateful UI

Use `createGScopeHook` when UI needs application state. A normal hook may live in the same `.g.tsx` file, but no React component in a `.g.tsx` file may call that normal hook directly. Components may call only GTSX hooks: `useGContext(...)` and hooks returned by `createGScopeHook(...)`.

```tsx
import { useState } from "react"
import { createGScopeHook, type GCases } from "gtsx"

type CounterProps = {
  title: string
}

type CounterScope = {
  count: number
  increment: () => void
}

function useRealCounterScope(): CounterScope {
  const [count, setCount] = useState(0)

  return {
    count,
    increment() {
      setCount((value) => value + 1)
    },
  }
}

const useCounterScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: CounterProps) {
  const scope = useCounterScope()

  return (
    <section>
      <h1>{props.title}</h1>
      <p>{scope.count}</p>
      <button type="button" onClick={scope.increment}>
        Increment
      </button>
    </section>
  )
}

Counter.cases = {
  zero: {
    props: { title: "Counter" },
    scope: { count: 0, increment() {} },
  },
  five: {
    props: { title: "Counter" },
    scope: { count: 5, increment() {} },
  },
} satisfies GCases<CounterProps, CounterScope>
```

Check it with:

```sh
gtsx check src/Counter.g.tsx
```

Expected result:

```txt
GTSX scope entry: src/Counter.g.tsx
- zero
- five
```

## File Boundary

The `.g.tsx` file is the UI model. It can contain:

- React JSX.
- UI prop types.
- Scope types used by the UI.
- GTSX providers created with `createGProvider`.
- Production hooks that are wrapped by `createGScopeHook`.
- Component cases on `Component.cases`.

You do not need to split a `.ts` file out just because the component is stateful.

Use separate `.ts` files only for shared business code or data supply that is not part of the UI model. If a type only describes the UI props of one GTSX component, keep it in the `.g.tsx` file.

When migrating existing components, keep component names and props contracts stable where practical, but update local imports to the `.g` module. For example, `import { Badge } from "./Badge"` can become `import { Badge } from "./Badge.g"`. A barrel may preserve a public API by re-exporting from the `.g` module.

## Hook Boundary

GTSX controls component state through this path:

```txt
props + provider context -> GTSX scope -> view
```

Inside any React component in a `.g.tsx` file, call only GTSX hooks:

- `useGContext(Provider)` for GTSX provider values.
- Hooks returned by `createGScopeHook(useRealScope)`.

Do not call ordinary hooks directly inside any `.g.tsx` component render path:

```tsx
import { useState } from "react"
import type { GCases } from "gtsx"

type CounterProps = {
  title: string
}

export default function Counter(props: CounterProps) {
  const [count] = useState(0) // Not allowed in a GTSX component.
  return <p>{props.title}: {count}</p>
}

Counter.cases = {
  ready: { props: { title: "Counter" } },
} satisfies GCases<CounterProps>
```

If a normal hook is needed for production behavior, wrap it at module scope:

```tsx
const useCounterScope = createGScopeHook(useRealCounterScope)
```

Then call only the returned GTSX hook from `.g.tsx` components:

```tsx
const scope = useCounterScope()
```

The normal hook can call React hooks, routers, stores, query clients, or other app-specific hooks. Preview cases supply `scope`, so GTSX can render controlled states without executing uncontrolled application state.

## Cases

Cases are static object literals attached to the component export.

Pure cases contain `props`:

```tsx
Badge.cases = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
} satisfies GCases<BadgeProps>
```

Stateful cases contain `props` and `scope`:

```tsx
Counter.cases = {
  zero: {
    props: { title: "Counter" },
    scope: { count: 0, increment() {} },
  },
} satisfies GCases<CounterProps, CounterScope>
```

Case values are live JavaScript values. They can include functions and imported fixtures. Do not put production secrets, credentials, customer data, or non-public tokens in cases.

Avoid computed case keys, dynamic case generation, and async case loading. GTSX expects cases to be statically enumerable.

Name cases by visual state, not implementation detail. The right vocabulary depends on the component:

- Basic UI: `default`, `disabled`, `danger`, `open`, `selected`, `longLabel`, `withIcon`.
- Composite UI: `empty`, `populated`, `overflowing`, `permissionDenied`.
- Page or feature UI: `loading`, `errorRetryable`, `ready`, `empty`, `unauthorized`.

Put the happy-path case first when the component has one. It should be the normal state a reviewer wants to see before edge states like loading, empty, error, overflow, or disabled.

Use at least two meaningful cases unless the component truly has only one stable visual state.

## Providers

Use a GTSX provider when cases need controlled context.

```tsx
import React from "react"
import { createGProvider, useGContext, type GCases } from "gtsx"

type ThemeScope = {
  mode: "light" | "dark"
}

const ThemeProvider = createGProvider((_props: Record<string, never>) =>
  React.useState<ThemeScope>({ mode: "light" }),
)

type PanelProps = {
  title: string
}

export default function Panel(props: PanelProps) {
  const theme = useGContext(ThemeProvider)
  return <section data-theme={theme.mode}>{props.title}</section>
}

Panel.cases = {
  light: {
    props: { title: "Settings" },
    providers: [[ThemeProvider, { mode: "light" }]],
  },
} satisfies GCases<PanelProps, never, [typeof ThemeProvider]>
```

`createGProvider(useValue)` follows the `react-tracked` mental model: the Provider owns state and update, `useGContext(Provider)` reads tracked state, and `useGContextUpdate(Provider)` reads the update function. Component cases provide preview fallback state with ordered provider entries.

## Multiple Exports

A `.g.tsx` file may export multiple components. Each exported component has a coordinate:

```txt
src/MultiExport.g.tsx#default
src/MultiExport.g.tsx#NamedBadge
```

Each exported component owns its own `Component.cases`.

## Verification

Run `gtsx check` before opening Studio or capturing screenshots:

```sh
gtsx check src/Counter.g.tsx
gtsx check src
```

Common diagnostics:

- `missing-cases`: add `Component.cases`.
- `non-static-case-key`: use literal case keys.
- `non-gtsx-hook`: move ordinary hook calls behind `createGScopeHook`, then call only the returned GTSX hook from the component.
- `scope-hook-cases-unsupported`: put cases on the component export, not on the GScope hook.

`gtsx check` is necessary but not sufficient. Also inspect whether the `.g.tsx` file owns the real visual UI, whether cases describe meaningful visual states, and whether stateful cases use concrete scope values instead of wrapper nodes.

Repository examples:

- Pure props: [`examples/src/cases/language/PrimitiveProps.g.tsx`](../examples/src/cases/language/PrimitiveProps.g.tsx)
- Stateful scope: [`examples/src/cases/stateful/NotificationBell.g.tsx`](../examples/src/cases/stateful/NotificationBell.g.tsx)
- Provider selection: [`packages/gtsx/test/fixtures/check-project/src/UserCard.g.tsx`](../packages/gtsx/test/fixtures/check-project/src/UserCard.g.tsx)
