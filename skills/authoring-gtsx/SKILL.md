---
name: authoring-gtsx
description: "Write .g.tsx components with best-practice UI models, static preview cases, and gtsx verification."
---

# Authoring gtsx Components

## Core idea

`.g.tsx` is TSX with a protocol. Each exported component owns real visual TSX and carries static `Component.cases` declaring its visual states. The data flow:

```
(props, context) → scope → view
```

Cases inject at the scope seam — preview renders any state without executing production hooks.

For existing TSX conversions, use `refactor-to-gtsx` first, then return here.

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

1. **Decide component kind** — pure (props only), stateful (`createGScopeHook`), or contextual (`createGProvider` + `useGContext`).
2. **Write the `.g.tsx` file** — see [REFERENCE.md](./REFERENCE.md) for patterns.
3. **Attach `Component.cases`** with `satisfies GCases<…>`.
4. **Run `gtsx check`** — fix diagnostics.
5. **Add edge-state cases** — empty, error, loading, overflow.

## Rules

- `.g.tsx` owns real visual UI. Never wrap `<ExistingComponent {...props} />`.
- Export at least one component. Default exports are optional.
- Author visual surfaces, not orchestration. No visual surface → descend or skip.
- Only gtsx hooks inside `.g.tsx` components: `useGContext`, hooks from `createGScopeHook`.
- Cases are static object literals. No computed keys, no dynamic generation.
- Name cases by visual state: `default`, `disabled`, `empty`, `loading`, `errorRetryable`, `overflowing`.
- Happy-path case first, then edge states.
- No `scope: { node: <OldComponent /> }` unless a slot is the real public contract.
- No secrets or customer data in cases.
- Type cases: `satisfies GCases<Props>`, `satisfies GCases<Props, Scope>`, or `satisfies GCases<Props, Scope, typeof providers>`.

## Diagnostics

| Code | Fix |
|------|-----|
| `missing-cases` | Add `Component.cases = { ... } satisfies GCases<…>` |
| `non-static-case-key` | Replace computed key with string literal |
| `non-gtsx-hook` | Wrap with `createGScopeHook(useRealHook)`, call only the returned hook |
| `scope-hook-cases-unsupported` | Move `.cases` from scope hook to component export |

## CLI

```sh
gtsx check <file.g.tsx|dir>         # validate contracts
gtsx check -p tsconfig.app.json .   # explicit project
gtsx serve                          # start Studio server
gtsx capture <file.g.tsx> --all     # screenshot all cases
```

## Reference

Full patterns (stateful, providers, discriminated unions, multiple exports, composition): [REFERENCE.md](./REFERENCE.md)
