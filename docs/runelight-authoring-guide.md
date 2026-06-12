# Runelight React Authoring Guide

How to write Runelight components: React components in `.g.tsx` files that use the `.g` protocol, pass `runelight check`, and render correctly in Studio. For Vue SFCs, see the [Vue Authoring Guide](./runelight-vue-authoring-guide.md).

This is the human-readable companion to the React agent skill. The canonical reference for all React patterns lives in [skills/authoring-runelight-react/REFERENCE.md](../skills/authoring-runelight-react/REFERENCE.md). This guide covers the mental model and decision points.

If converting existing TSX, start with the [React Refactor Guide](./runelight-refactor-guide.md). If the project isn't wired for Runelight yet, run the [`setup-runelight`](../skills/setup-runelight/SKILL.md) skill.

---

## The Mental Model

A Runelight component is a real React component in a `.g.tsx` file. `.g.tsx` is the React/TSX format for the `.g` protocol. Protocol names carry a `G` marker: `G`-prefixed types such as `GFrames`, and `createG*`/`useG*` helpers such as `createGScopeHook`, `createGProvider`, and `useGContext`.

It also declares its visual states:

```
(props, context) → scope → view
```

Frames inject at the seam. Preview renders any visual state without executing production hooks. The component itself never knows whether it is running in production or in preview — the substitution happens above it.

A `.g.tsx` file contains:

- Real visual TSX (the actual DOM this component renders)
- Props and scope types
- Static `Component.frames` declaring visual states
- Optionally: a production hook wrapped by `createGScopeHook`, providers created with `createGProvider`

## Principles

1. **Author visual surfaces, not orchestration.** Route glue, provider nesting, layout slots, and permission gates belong outside `.g.tsx`.
2. **Model visual states through props, scope, and providers.** A frame describes what the user sees.
3. **Scope is UI state and callbacks.** Not routers, query clients, stores, or React nodes.
4. **No visual surface → no `.g.tsx`.** Don't create files to mirror project structure.

A wrapper is never a valid `.g.tsx` component. If the real UI lives elsewhere, the `.g.tsx` file must contain that real UI — not forward props to it.

## Which Pattern Do I Need?

```
My component is fully described by its props alone
  → Pure Component

My component depends on hooks, state, fetches, or effects
  → Stateful Component (use createGScopeHook)

My component reads shared context (theme, auth, locale)
  → Contextual Component (use createGProvider + useGContext)
```

When in doubt, start with Pure. Introduce scope or providers only when props alone cannot describe the visual states you need.

## Pure Component

The simplest frame. Every preview state is described by props:

```tsx
import type { GFrames } from "@runelight/react/runtime"

type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<BadgeProps>
```

## Stateful Component

When the UI depends on application state, wrap your production hook:

```tsx
import { useState } from "react"
import { createGScopeHook, type GFrames } from "@runelight/react/runtime"

type CounterProps = { title: string }
type CounterScope = { count: number; increment: () => void }

function useRealCounterScope(): CounterScope {
  const [count, setCount] = useState(0)
  return { count, increment: () => setCount((value) => value + 1) }
}

const useCounterScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: CounterProps) {
  const scope = useCounterScope()
  return <button onClick={scope.increment}>{props.title}: {scope.count}</button>
}

Counter.frames = {
  zero: { props: { title: "Counter" }, scope: { count: 0, increment() {} } },
  five: { props: { title: "Counter" }, scope: { count: 5, increment() {} } },
} satisfies GFrames<CounterProps, CounterScope>
```

The real hook can call any React hooks. `createGScopeHook` wraps it so that in preview, the frame-supplied scope is returned instead.

For discriminated unions, combined scope+provider patterns, and collection branches, see the [full reference](../skills/authoring-runelight-react/REFERENCE.md).

## The Hook Boundary

Inside a `.g.tsx` component body, call only:

- `useGContext(Provider)` — read provider values
- Hooks from `createGScopeHook(useRealHook)` — read scope

Never call `useState`, `useEffect`, `useQuery`, or other React/library hooks directly. Production behavior lives inside the real hook; `createGScopeHook` wraps it.

## Frames

Frames are static object literals attached to the component export.

**Naming:** describe the visual state, not the implementation.

| Component kind | Good names |
|---------------|------------|
| Basic UI | `default`, `disabled`, `danger`, `open`, `selected`, `longLabel` |
| Composite | `empty`, `populated`, `overflowing`, `permissionDenied` |
| Page/feature | `loading`, `errorRetryable`, `ready`, `unauthorized` |

**Rules:**

- Happy-path frame first, then edge states.
- At least two frames (unless the component truly has one stable visual state).
- Static object literals only — no computed keys, no dynamic generation.
- No secrets or customer data.
- No-op functions for callbacks: `increment() {}`.

**Coverage:** think about boundary states for every component — happy path, empty, loading, error, overflow, disabled, first-use, permission-denied.

## JSX Branches

If props, scope, or provider context decides whether JSX renders, write that branch so `runelight check` can trace it back. Use direct conditionals, `if` returns, `&&`, `||`, and traceable `map` callbacks. Avoid helper predicates, `switch`, or stored JSX variables.

For the full rules on what counts as inspectable vs. opaque, see [Static Contract](./runelight-static-contract.md).

## Verification

```sh
runelight check src/Badge.g.tsx    # single file
runelight check src                # directory
```

| Diagnostic | Fix |
|-----------|-----|
| `missing-frames` | Add `Component.frames = { ... } satisfies GFrames<…>` |
| `non-static-frame-key` | Use literal frame keys |
| `non-runelight-hook` | Wrap with `createGScopeHook`, call only the returned hook |
| `scope-hook-frames-unsupported` | Move `.frames` from scope hook to component export |
| `missing-provider-variant-frames` | Mark frames with `GProviderFrame` for every consumed provider variant |
| `opaque-jsx-control-flow` | Rewrite branches as direct props/scope/context expressions |
| `uncovered-jsx-branch` | Add a frame that makes the branch reachable |

Full diagnostic list: [Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).
