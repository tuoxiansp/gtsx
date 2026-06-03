---
name: authoring-gtsx
description: "Use when writing, editing, or reviewing .g.tsx files/components; guides UI models, static preview frames, provider variants, JSX branch shape, and gtsx verification."
---

# Authoring gtsx Components

## Core idea

`.g.tsx` is TSX with a protocol. Each exported component owns real visual TSX and carries static `Component.frames` declaring its visual states. The data flow:

```
(props, context) → scope → view
```

Frames inject at the scope seam — preview renders any state without executing production hooks.

For existing TSX conversions, use `refactor-to-gtsx` first, then return here.

## Quick start

```tsx
import type { GFrames } from "@gtsx/core"

export default function Badge(props: { tone: "ok" | "warn"; label: string }) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  ok:   { props: { tone: "ok",   label: "Ready" } },
  warn: { props: { tone: "warn", label: "Needs review" } },
} satisfies GFrames<{ tone: "ok" | "warn"; label: string }>
```

Verify: `gtsx check src/Badge.g.tsx`

## Workflow

1. **Decide component kind** — pure (props only), stateful (`createGScopeHook`), or contextual (`createGProvider` + `useGContext`).
2. **Write the `.g.tsx` file** — see [REFERENCE.md](./REFERENCE.md) for patterns.
3. **Attach `Component.frames`** with `satisfies GFrames<…>`.
4. **Run `gtsx check`** — fix diagnostics.
5. **Add edge-state frames** — empty, error, loading, overflow.

## Rules

- `.g.tsx` owns real visual UI. Never wrap `<ExistingComponent {...props} />`.
- Export at least one component. Default exports are optional.
- Author visual surfaces, not orchestration. No visual surface → descend or skip.
- Only gtsx hooks inside `.g.tsx` components: `useGContext`, hooks from `createGScopeHook`.
- Use provider variants only for meaningful finite environment axes. `createGProvider(..., { variants })` declares the axis; `GProviderFrame<typeof Provider, "variant">` marks frame coverage; `providers: [[Provider, value]]` still supplies runtime context state. Leave truly env-neutral frames unmarked; use a variant union such as `GProviderFrame<typeof Provider, "login" | "anonymous">` only when one frame intentionally covers multiple variants.
- Frames are static object literals. No computed keys, no dynamic generation.
- JSX-producing branches must be first-order over props, gtsx scope, or gtsx provider context. Use direct conditionals, `if` returns, `&&`, `||`, and traceable `map`/render callbacks. Avoid helper predicates, `switch`, JSX-returning loops, or local variables that store JSX.
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
| `non-gtsx-hook` | Wrap with `createGScopeHook(useRealHook)`, call only the returned hook |
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
gtsx check <file.g.tsx|dir>         # validate contracts
gtsx check -p tsconfig.app.json .   # explicit project
gtsx serve                          # start Studio server
gtsx capture <file.g.tsx> --all     # screenshot all frames
```

## Reference

Full patterns (stateful, providers, discriminated unions, multiple exports, composition): [REFERENCE.md](./REFERENCE.md)
