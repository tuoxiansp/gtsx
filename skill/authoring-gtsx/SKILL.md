---
name: authoring-gtsx
description: Write .g.tsx components with static preview cases and verify them with the gtsx toolchain. Covers pure-props, createGScope stateful, and useGContext provider patterns. Use when creating or editing .g.tsx files, adding component cases, fixing gtsx check diagnostics, or integrating GTSX into a React component.
---

# Authoring GTSX Components

## Core idea

`.g.tsx` is TSX with a protocol. You write normal React components, but each exported component carries a static `Component.cases` declaring its visual states. The data flow is:

```
(props, context) → scope → view
```

Cases inject at the `scope` seam — preview renders any state without executing production hooks. The hook boundary (`createGScope` / `useGContext` only) exists to guarantee this injection point.

## Quick start

```tsx
import type { GCases } from "gtsx"

export default function Badge(props: { tone: "ok" | "warn"; label: string }) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.cases = {
  ok:   { props: { tone: "ok",   label: "Ready" } },
  warn: { props: { tone: "warn", label: "Needs review" } },
} satisfies GCases<{ tone: "ok" | "warn"; label: string }>
```

Verify: `gtsx check src/Badge.g.tsx`

## Workflow

1. **Decide component kind** — pure (props only), stateful (needs `createGScope`), or contextual (needs `useGContext`).
2. **Write the `.g.tsx` file** following the patterns in [REFERENCE.md](./REFERENCE.md).
3. **Attach `Component.cases`** as a static object literal with `satisfies GCases<…>`.
4. **Run `gtsx check`** — fix any diagnostics before proceeding.
5. **Iterate** — add cases for edge states (empty, error, loading, overflow).

## Rules (non-negotiable)

- Only call GTSX hooks (`useGContext`, hooks from `createGScope`) inside `.g.tsx` component bodies. Never call `useState`, `useEffect`, or other React hooks directly.
- Cases must be static object literals. No computed keys, no dynamic generation, no async loading.
- Do not put secrets, credentials, tokens, or customer data in cases.
- Use `satisfies GCases<Props>` (pure) or `satisfies GCases<Props, Scope>` (stateful) or `satisfies GCases<Props, Scope, [typeof Provider]>` (contextual).

## Diagnostics quick-fix

| Code | Fix |
|------|-----|
| `missing-cases` | Add `Component.cases = { ... } satisfies GCases<…>` |
| `non-static-case-key` | Replace computed key with a string literal |
| `non-gtsx-hook` | Wrap the hook with `createGScope(useRealHook)`, call only the returned GTSX hook |
| `scope-hook-cases-unsupported` | Move `.cases` from the scope hook to the component export |

## CLI reference

```sh
gtsx check <file.g.tsx|dir>         # validate contracts
gtsx check -p tsconfig.app.json .   # explicit project
gtsx serve                          # start Studio server
gtsx capture <file.g.tsx> --all     # screenshot all cases
```

## Advanced

See [REFERENCE.md](./REFERENCE.md) for full patterns: stateful scope, providers, multiple exports, discriminated unions, composition, and case design guidelines.
