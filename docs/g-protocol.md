# .g Protocol

The `.g` protocol is a source-level model for UI states. It lets a component declare the visual states that protocol consumers can render, inspect, and verify.

Runelight is the product. `.g` is the protocol. `.g.tsx` and `.g.vue` are file formats that expose that protocol from different component systems.

## Protocol Model

The protocol answers five questions:

1. **Which files participate?** Participating files use a `.g.*` extension, such as `.g.tsx` or `.g.vue`.
2. **Which components are renderable?** Each indexed component receives a stable coordinate such as `src/Badge.g.tsx#default` or `src/UserCard.g.vue#default`.
3. **Which visual states exist?** Frames are static, named states such as `ready`, `loading`, `empty`, `error`, or `disabled`.
4. **Where can state be substituted?** React uses explicit scope and provider seams. Vue uses template-visible frame scope.
5. **What can be checked statically?** Consumers should be able to enumerate frames and reason about reachable visual branches without executing opaque application state.

These pieces are additive. A `.g` file should remain an ordinary source file for its host framework, with static frame data attached in the format that framework can naturally express.

## File Formats

Different frameworks expose the same protocol through different source shapes.

| Protocol concept | React/TSX | Vue SFC |
| --- | --- | --- |
| Participating file | `.g.tsx` | `.g.vue` |
| Component entry | Exported React component | The SFC default component |
| Frame declaration | `Component.frames = { ... }` | `<g:frames>export default { ... }</g:frames>` |
| Main substitution surface | Props, scope hooks, providers | Props and template scope |
| Branch analysis surface | JSX expressions | SFC template directives |

### React `.g.tsx`

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

### Vue `.g.vue`

A `.g.vue` file is an ordinary Vue SFC plus one Runelight custom block. The SFC has one protocol component entry: the default component at `path/to/File.g.vue#default`.

```vue
<template>
  <section v-if="status === 'ready'">
    {{ user.name }}
  </section>
  <section v-else>
    Loading {{ props.userId }}
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const status = useRemoteStatus(props.userId)
</script>

<g:frames>
export default {
  loading: {
    props: { userId: "user_1" },
    scope: { status: "loading" },
  },
  ready: {
    props: { userId: "user_42" },
    scope: {
      status: "ready",
      user: { name: "Ada Lovelace" },
    },
  },
}
</g:frames>
```

`<g:frames>` contains a single statically enumerable `export default { ... }` object. Top-level keys are frame names.

During protocol preview, Runelight treats the Vue template as the primary render surface. It keeps the SFC template and styles, reads the selected frame, and injects the frame's `props` and `scope` into a synthetic preview setup. Production-only script state does not need to be intercepted if the template values needed for the visual state are declared by the frame.

## Frames

A frame describes one meaningful visual state. Frame names should describe what appears on screen: `ready`, `loading`, `empty`, `error`, `disabled`, `overflowing`, `admin`, or `anonymous`.

Simple React components often need only props:

```tsx
Badge.frames = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<BadgeProps>
```

Vue frames use the same static object shape inside `<g:frames>`:

```vue
<g:frames>
export default {
  loading: {
    props: { userId: "user_1" },
    scope: { status: "loading" },
  },
  ready: {
    props: { userId: "user_42" },
    scope: { status: "ready", user: { name: "Ada Lovelace" } },
  },
}
</g:frames>
```

Supported frame fields:

| Field | Meaning |
| --- | --- |
| `props` | Values passed as component props. In Vue preview they are also exposed through `props` and direct prop-key variables. |
| `scope` | State supplied at a protocol seam. React scope hooks read this value; Vue preview exposes it as template-visible scope for the selected frame. |
| `providers` | React provider seam values for context-dependent components. React provider helpers consume these values directly. |
| `provide` | Vue-native provide entries: `[[injectionKey, value]]`. Vue preview calls `provide(injectionKey, value)` before rendering the frame. |

Frame data should be static and inspectable: object literals with statically enumerable keys. Protocol consumers should not need to execute application code to discover the frame list.

## State Substitution

The `.g` protocol keeps preview substitution at explicit source-level boundaries. The boundary is framework-specific, but the goal is the same: render a declared visual state without pretending to run the whole application.

### React Seams

React components use explicit seams:

- `createGScopeHook` wraps a production hook. In production it calls the real hook; under protocol rendering it returns the frame-supplied scope.
- `createGProvider` creates a provider whose value can be supplied by frames during protocol rendering. Provider variants can describe finite environment axes such as role, theme, locale, or auth state.
- `useGContext` reads provider values inside a `.g.tsx` component.

The component itself does not branch on the renderer.

### Vue Template Scope

Vue already separates template shape from script setup. `.g.vue` uses that split as the protocol boundary.

Template-visible values that define a visual state should come from one of these sources:

- props declared by the frame;
- `scope` declared by the frame;
- local helpers, imports, and static literals that the preview transform can preserve safely.

Opaque script expressions are not automatically a problem. A formatter such as `formatDate(user.createdAt)` can remain an ordinary helper when it only formats displayed text. It becomes part of the static contract only when an opaque value controls render shape, visibility, iteration, or component selection, for example through `v-if`, `v-else-if`, `v-for`, `v-show`, or dynamic `:is`.

This keeps the Vue contract template-first: analyze what the template needs to render the branch, then require frames to supply those template-visible values.

### Vue Provide/Inject

Vue context uses native `provide` / `inject`. Runelight adds a typed key helper only when the injection should appear as a finite Studio axis:

```ts
// auth.ts
import { defineGInjectionKey } from "@runelight/core/vue"

export const authKey = defineGInjectionKey<{ role: "admin" | "viewer" }>({
  variants: ["admin", "viewer"] as const,
})
```

Production code stays ordinary Vue:

```vue
<script setup lang="ts">
import { inject } from "vue"
import { authKey } from "./auth"

const auth = inject(authKey)!
</script>
```

Frames import the same key and use a Vue-shaped `provide` field:

```vue
<g:frames lang="ts">
import { authKey } from "./auth"
import type { GVueFrames, GVueProvideFrame } from "@runelight/core/vue"

export default {
  admin: {
    props: {},
    provide: [[authKey, { role: "admin" }]],
  } satisfies GVueProvideFrame<typeof authKey, "admin">,
  viewer: {
    props: {},
    provide: [[authKey, { role: "viewer" }]],
  } satisfies GVueProvideFrame<typeof authKey, "viewer">,
} satisfies GVueFrames<Record<string, never>, never, [typeof authKey]>
</g:frames>
```

## Static Check

`runelight check` verifies that the frame model can represent the component's reachable visual branches. If render structure depends on props, scope, or provider context, at least one frame should make each branch reachable.

The check is intentionally narrow. It does not prove every possible state combination. It prevents reachable visual branches from escaping the declared frame set.

React diagnostics inspect JSX branches, scope seams, and provider variants. Vue diagnostics inspect SFC frame enumeration, previewability, declared injection-key variants, and template directive reachability. Vue branch analysis is template-first: `v-if`, `v-else-if`, `v-else`, `v-show`, `v-for`, and dynamic component `:is` checks are derived from template expressions over frame `props`, `scope`, and injected `provide` values, not from arbitrary `<script setup>` execution.

For branch-coverage rules and diagnostics, see [.g Static Contract](./runelight-static-contract.md).

## Protocol Consumers

Runelight reads the `.g` protocol from the selected project:

- `.g.tsx` and `.g.vue` files become indexed component entries.
- exported React components and default Vue SFCs become coordinates.
- frames become render targets.
- scope and providers become preview state inputs.
- diagnostics become actionable feedback.

Other consumers can use the same protocol surface without changing the component source.
