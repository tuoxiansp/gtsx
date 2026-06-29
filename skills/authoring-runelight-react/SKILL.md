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
import type { GFrames } from "@runelight/react/runtime"

export default function Badge(props: { tone: "ok" | "warn"; label: string }) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  ok:   { description: "Ready badge", props: { tone: "ok",   label: "Ready" } },
  warn: { description: "Warning badge for a review-needed state", props: { tone: "warn", label: "Needs review" } },
} satisfies GFrames<{ tone: "ok" | "warn"; label: string }>
```

Verify:

```sh
runelight check src/Badge.g.tsx
runelight preview-targets src/Badge.g.tsx --json
runelight capture --path "<target.path>"
```

## Workflow

1. **Decide component kind** — pure (props only), stateful (`createGScopeHook`), or contextual (`createGProvider` + `useGContext`).
2. **Write the `.g.tsx` file** — see [REFERENCE.md](./REFERENCE.md) for patterns.
3. **Attach `Component.frames`** with `satisfies GFrames<…>` and concise static `description` strings for meaningful states.
4. **Run `runelight check`** — fix diagnostics.
5. **Get rendered feedback** — prefer a covered app/screen/parent entry that renders the component, then use `runelight preview-targets <entry[#export]> --json`, open representative `/runelight?...` paths in the browser or capture them with `runelight capture --path "<target.path>"`, then fix mismatches between the rendered UI, frame descriptions, and intended states.
6. **Use `runelight inspect <entry[#export]> --json` when composing UI** — inspect the reachable GUI map for the entry you are building and choose related preview targets deliberately.
7. **Add edge-state frames** — empty, error, loading, overflow.
8. **Run project typecheck or the host build** when touched props, imports, styles, or framework wiring could break normal app code.

## Authoring Feedback Loop

Authoring is not done when the file merely typechecks or passes `runelight check`. A new or edited `.g.tsx` entry must also be observed through the Runelight preview path when the project is wired for preview.

1. Run `runelight check <entry[#export]|file.g.tsx>` and fix contract diagnostics.
2. Choose the observation root. Default to the nearest meaningful covered app/screen/parent entry that renders the component, especially when checking layout, spacing, density, theme, container width, or sibling alignment. Use the component's own entry only when no covered parent exists, the component is itself the app/screen entry, or you are debugging its isolated frame contract.
3. Run `runelight containing-frames <entry[#export]> --json` for the component. Prefer contexts whose `root.coordinate` differs from the target; if every returned root is the target, treat it as target-level coverage rather than broader app/screen context.
4. If no ancestor context is available, find parent/root candidates with `rg` imports/usages, nearby route/screen `.g.tsx` files, changed parent `.g.tsx` files, and `runelight inspect <entry[#export]> --json` on likely app/screen entries. Then run `runelight preview-targets <observation-entry[#export]> --json`.
5. Read the target paths and frame descriptions. Choose the happy path plus the new or risky edge states you just authored. For child-component work, prefer paths whose `paths` nodes include both the parent state and the target child state.
6. Open those `/runelight?...` paths in the browser, or run `runelight capture --path "<target.path>"` for selected targets.
7. Compare rendered output against the frame `description`, intended props/scope/provider values, branch coverage, parent layout context, and local design language.
8. If the render is wrong, edit the component or frames and repeat the same preview/capture observation.
9. Finish with `runelight check` and typecheck/build when code changes can affect the host app.

If preview is not available because setup or the Host is missing, say that rendered feedback was blocked and name the missing setup step. If the work turns into subjective visual polish rather than authoring coverage, switch to the `polish` workflow and perform its required sync before editing.

## Rules

- `.g.tsx` owns real visual UI. Never wrap `<ExistingComponent {...props} />`.
- Export at least one component. Default exports are optional.
- Author visual surfaces, not orchestration. During refactor work, no visual surface at the current file means descend to children or extract visible JSX; only a leaf with no owned visual UI should be left without `.g.tsx`.
- Only Runelight hooks inside `.g.tsx` components: `useGContext`, hooks from `createGScopeHook`.
- Use provider variants only for meaningful finite environment axes. `createGProvider(..., { variants })` declares the axis; `GProviderFrame<typeof Provider, "variant">` marks frame coverage; `providers: [[Provider, value]]` still supplies runtime context state. Leave truly env-neutral frames unmarked; use a variant union such as `GProviderFrame<typeof Provider, "login" | "anonymous">` only when one frame intentionally covers multiple variants.
- Frames are static object literals. No computed keys, no dynamic generation.
- JSX-producing branches must be first-order over props, Runelight scope, or Runelight provider context. Use direct conditionals, `if` returns, `&&`, `||`, and traceable `map`/render callbacks. Avoid helper predicates, `switch`, JSX-returning loops, or local variables that store JSX.
- Name frames by visual state: `default`, `disabled`, `empty`, `loading`, `errorRetryable`, `overflowing`.
- Give each meaningful frame a short `description` that explains the visible state or scenario for agents reading `preview-targets` output.
- Happy-path frame first, then edge states.
- No `scope: { node: <OldComponent /> }` unless a slot is the real public contract.
- JSX-valued props, `children`, render props, icons, actions, and slots are visual inputs. Use them only when they are the component's real public contract, and make their frame values representative enough for visual review. Do not use throwaway `<div>Placeholder</div>` nodes for a slot that determines most of the preview.
- When a frame needs JSX-valued input, trace what production actually passes and use the closest safe equivalent: real pure child components, imported design-system pieces, or a local static fixture that preserves the density, hierarchy, labels, controls, and edge state being reviewed. If that would require mounting old hookful/runtime UI, descend, extract, or migrate that child surface instead of faking it.
- No secrets or customer data in frames.
- Type frames: `satisfies GFrames<Props>`, `satisfies GFrames<Props, Scope>`, or `satisfies GFrames<Props, Scope, typeof providers>`.
- In composition, parent-rendered props and ancestor provider values are authoritative for child instances. The child frame supplies child-local scope and fallback provider mocks; do not use child frame props/providers to replace values that the parent actually renders.

## Diagnostics

| Code | Fix |
|------|-----|
| `missing-frames` | Add `Component.frames = { ... } satisfies GFrames<…>` |
| `non-static-frame-key` | Replace computed key with string literal |
| `missing-frame-description` | Add a static `description` string to the frame |
| `non-static-frame-description` | Replace the frame `description` with a literal string |
| `thin-wrapper` | Move the real visual TSX into the `.g.tsx` export, or attach frames to the component that owns it |
| `non-runelight-hook` | Wrap with `createGScopeHook(useRealHook)`, call only the returned hook |
| `scope-hook-frames-unsupported` | Move `.frames` from scope hook to component export |
| `missing-provider-variant-frames` | Mark frames with `GProviderFrame` for every consumed provider variant |
| `missing-provider-variants` | Declare provider `variants` or remove the variant marker |
| `unknown-provider-variant` | Use one of the provider's declared variants |
| `unmarked-provider-variant-projection` | Warning: inspect whether provider-derived child props need projected `GProviderFrame` markers |
| `opaque-jsx-control-flow` | Rewrite JSX-producing branches as direct props/scope/context expressions |
| `unknown-jsx-branch-coverage` | Inline static frame values that affect JSX reachability |
| `uncovered-jsx-branch` | Add a frame that makes the JSX branch reachable |

## CLI Reference

For the packaged command reference and workflow prompts, read `node_modules/@runelight/skills/references/cli.md`.

## Reference

Full patterns (stateful, providers, discriminated unions, multiple exports, composition): [REFERENCE.md](./REFERENCE.md)
