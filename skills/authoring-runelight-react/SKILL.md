---
name: authoring-runelight-react
description: "Write, edit, or review Runelight React components in .g.tsx files. Use when working on React/TSX .g protocol components, GFrames, createGScopeHook, createGProvider, provider variants, JSX branch coverage, or React Runelight authoring diagnostics."
---

# Authoring Runelight React Components

## Core idea

A Runelight React component is TSX in a `.g.tsx` file, the React/TSX format for the `.g` protocol. Protocol names carry a `G` marker: `G`-prefixed types such as `GFrames`, and `createG*`/`useG*` helpers such as `createGScopeHook` and `createGProvider`.

Each exported component owns real visual TSX and carries static `Component.frames` declaring its visual states. The data flow:

```
(props, context) → scope → view
```

Frames inject at the scope seam — preview renders any state without executing production hooks.

For existing TSX conversions, use `refactor-to-runelight-react` first, then return here. For Vue SFC authoring, use `authoring-runelight-vue`.

## Quick start

```tsx
import type { GFrames } from "@runelight/core"

export default function Badge(props: { tone: "ok" | "warn"; label: string }) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  ok:   { props: { tone: "ok",   label: "Ready" } },
  warn: { props: { tone: "warn", label: "Needs review" } },
} satisfies GFrames<{ tone: "ok" | "warn"; label: string }>
```

Verify: `runelight check src/Badge.g.tsx`

## Workflow

1. **Decide component kind** — pure (props only), stateful (`createGScopeHook`), or contextual (`createGProvider` + `useGContext`).
2. **Write the `.g.tsx` file** — see [REFERENCE.md](./REFERENCE.md) for patterns.
3. **Attach `Component.frames`** with `satisfies GFrames<…>`.
4. **Run `runelight check`** — fix diagnostics.
5. **Add edge-state frames** — empty, error, loading, overflow.

## Rules

- `.g.tsx` owns real visual UI. Never wrap `<ExistingComponent {...props} />`.
- Export at least one component. Default exports are optional.
- Author visual surfaces, not orchestration. No visual surface → descend or skip.
- Only Runelight hooks inside `.g.tsx` components: `useGContext`, hooks from `createGScopeHook`.
- Use provider variants only for meaningful finite environment axes. `createGProvider(..., { variants })` declares the axis; `GProviderFrame<typeof Provider, "variant">` marks frame coverage; `providers: [[Provider, value]]` still supplies runtime context state. Leave truly env-neutral frames unmarked; use a variant union such as `GProviderFrame<typeof Provider, "login" | "anonymous">` only when one frame intentionally covers multiple variants.
- Frames are static object literals. No computed keys, no dynamic generation.
- JSX-producing branches must be first-order over props, Runelight scope, or Runelight provider context. Use direct conditionals, `if` returns, `&&`, `||`, and traceable `map`/render callbacks. Avoid helper predicates, `switch`, JSX-returning loops, or local variables that store JSX.
- Name frames by visual state: `default`, `disabled`, `empty`, `loading`, `errorRetryable`, `overflowing`.
- Happy-path frame first, then edge states.
- No `scope: { node: <OldComponent /> }` unless a slot is the real public contract.
- No secrets or customer data in frames.
- Type frames: `satisfies GFrames<Props>`, `satisfies GFrames<Props, Scope>`, or `satisfies GFrames<Props, Scope, typeof providers>`.

## Diagnostics

| Code | Fix |
|------|-----|
| `missing-frames` | Add `Component.frames = { ... } satisfies GFrames<…>` |
| `non-static-frame-key` | Replace computed key with string literal |
| `non-runelight-hook` | Wrap with `createGScopeHook(useRealHook)`, call only the returned hook |
| `scope-hook-frames-unsupported` | Move `.frames` from scope hook to component export |
| `missing-provider-variant-frames` | Mark frames with `GProviderFrame` for every consumed provider variant |
| `missing-provider-variants` | Declare provider `variants` or remove the variant marker |
| `unknown-provider-variant` | Use one of the provider's declared variants |
| `unmarked-provider-variant-projection` | Warning: inspect whether provider-derived child props need projected `GProviderFrame` markers |
| `opaque-jsx-control-flow` | Rewrite JSX-producing branches as direct props/scope/context expressions |
| `unknown-jsx-branch-coverage` | Inline static frame values that affect JSX reachability |
| `uncovered-jsx-branch` | Add a frame that makes the JSX branch reachable |

## CLI

```sh
runelight check <file.g.tsx|dir>         # validate contracts
runelight check -p tsconfig.app.json .   # explicit project
runelight serve                          # start Studio server
runelight capture <file.g.tsx> --all     # screenshot all frames
```

## Reference

Full patterns (stateful, providers, discriminated unions, multiple exports, composition): [REFERENCE.md](./REFERENCE.md)
