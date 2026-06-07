# .g Protocol

The `.g` protocol is a source-level model for UI states. It lets a component declare the visual states that protocol consumers can render, inspect, and verify.

Runelight is the product. `.g` is the protocol. `.g.tsx` is the React/TSX file format for that protocol.

## React Format

A `.g.tsx` file is ordinary TSX with static visual-state data attached to exported components:

```tsx
import type { GFrames } from "@runelight/core"

export default function Badge(props: { tone: "neutral" | "warning"; label: string }) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<{ tone: "neutral" | "warning"; label: string }>
```

The component remains a real React component. Production code renders the same TSX. Frames are static data for rendering, inspection, and verification.

## What The Protocol Adds

The `.g` protocol adds three source-level pieces:

1. **Participating files.** In React projects, `.g.tsx` marks files that participate in the protocol.
2. **Frames.** `Component.frames` declares named visual states through props, scope values, and provider values.
3. **Seams.** Scope hooks and providers define where a frame can substitute state for stateful and context-dependent components.

These pieces are additive. They do not change React's rendering model or require preview wrappers around production components.

## Frames

A frame describes one meaningful visual state. Simple components often need only props:

```tsx
Badge.frames = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<BadgeProps>
```

Stateful components can add `scope`. Contextual components can add `providers`.

Frame names should describe what appears on screen: `ready`, `loading`, `empty`, `error`, `disabled`, `overflowing`, `admin`, or `anonymous`.

## Seams

The protocol keeps substitution at explicit seams:

- `createGScopeHook` wraps a production hook. In production it calls the real hook; under protocol rendering it returns the frame-supplied scope.
- `createGProvider` creates a provider whose value can be supplied by frames during protocol rendering. Provider variants can describe finite environment axes such as role, theme, locale, or auth state.
- `useGContext` reads provider values inside a `.g.tsx` component.

The component itself does not branch on the renderer.

## Static Check

`runelight check` verifies that the frame model can represent the component's reachable visual branches. If JSX depends on props, scope, or provider context, at least one frame should make each branch reachable.

The check is intentionally narrow. It does not prove every possible state combination. It prevents reachable visual branches from escaping the declared frame set.

For branch-coverage rules and diagnostics, see [.g Static Contract](./runelight-static-contract.md).

## Protocol Consumers

Runelight reads the `.g` protocol from the selected TypeScript project:

- `.g.tsx` files become indexed component entries.
- exported components become coordinates.
- frames become render targets.
- provider variants become environment controls.
- diagnostics become actionable feedback.

Other consumers can use the same protocol surface without changing the component source.
