# Runelight Design Workspace

Use Studio as a scratchpad for product design exploration — without the formality of component coverage.

The framework-specific agent workflows live in [`skills/design-runelight-react/SKILL.md`](../skills/design-runelight-react/SKILL.md) and [`skills/design-runelight-vue/SKILL.md`](../skills/design-runelight-vue/SKILL.md). Setup installs the one that matches the user's project. This document explains the concept and the file contract for humans.

---

## What This Is

The design workspace is a lightweight surface inside Studio for AI-assisted product design drafts. It shares the same preview route and the same Studio shell, but it is deliberately separate from formal component coverage.

The difference:

| | Component `.g.*` | Design frame |
|---|---|---|
| **Purpose** | Cover all meaningful visual states | Explore one happy path |
| **Frames** | Multiple, named by visual state | One: `live` |
| **Alternatives** | Multiple frames in one file | Multiple files |
| **Scope** | Production component model | Scratch iteration |
| **Style** | May import shared code | Prefer self-contained |

## How It Works

1. You describe what you want to a local agent.
2. The agent writes or edits a framework-specific design frame in `project.entryRoot/design/`.
3. You open `/runelight/studio#/drafts`.
4. Each file appears as a draggable frame on a canvas. Positions are stored in your browser's `localStorage` — nothing is written to the repo.

## Frame Contract

- React location: `project.entryRoot/design/<FrameName>.g.tsx`, where `project.entryRoot` is the local `/runelight` entry directory recorded by setup.
- Vue location: `project.entryRoot/design/<FrameName>.g.vue`.
- React files default-export one React component and attach `Component.frames`.
- Vue files are ordinary SFCs with one `<g:frames>` block.
- One frame named `live`.
- Multiple alternatives = multiple files, not multiple frames.
- Prefer self-contained frames — quick drafts shouldn't depend on fragile helper resolution.
- Never write screenshots, serialized DOM, or layout positions into the repo.

Minimal React frame:

```tsx
"use client"

import type { GFrames } from "@runelight/react/runtime"

export default function CheckoutFlow() {
  return <main>{/* visual draft */}</main>
}

CheckoutFlow.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
```

Minimal Vue frame:

```vue
<template>
  <main>
    <!-- visual draft -->
  </main>
</template>

<g:frames>
export default {
  live: {
    props: {},
    scope: {},
  },
}
</g:frames>
```

## Opening It

The design board:

```
/runelight/studio#/drafts
```

A single frame directly:

```
/runelight?entry=src%2Fapp%2Frunelight%2Fdesign%2FCheckoutFlow.g.tsx%23default&frame=live&chrome=0
```

For Vue, the same URL shape points at a `.g.vue` entry:

```
/runelight?entry=src%2Fapp%2Frunelight%2Fdesign%2FCheckoutFlow.g.vue%23default&frame=live&chrome=0
```

The URL shape is identical for both frameworks; only the file extension differs. Replace the `src%2Fapp%2Frunelight` segment with the URL-encoded `project.entryRoot` if setup chose a different entry root.

## The Agent's Design Loop

The quality of a design frame doesn't depend on how well you word the prompt. The agent runs a loop:

1. **Context scan** — inspects your existing product: styles, tokens, components, copy tone, viewport.
2. **Intent expansion** — turns your request into a brief: goal, audience, core job, constraints.
3. **Direction gate** — asks one clarifying question only if the missing detail would change the product direction. Otherwise makes an explicit assumption and proceeds.
4. **Layout plan** — decides hierarchy, primary action, density, visual system.
5. **Frame implementation** — writes a self-contained `.g.tsx` or `.g.vue` file with realistic content.
6. **Critique** — reviews against clarity, rhythm, domain fit, accessibility. Revises if generic.

You see the result in Studio and react: "adjust this", "try a different approach", "make it denser". The agent iterates on the same frame or creates alternatives as separate files.

## When It Doesn't Work

- **Frames don't appear in Studio?** Confirm `project.entryRoot` is set in `runelight.config.ts`, then restart the dev server and reload Studio.
- **Resolution errors?** Keep frames self-contained. If a sibling helper file can't be resolved in preview, inline the dependency.
- **Project not Runelight-enabled?** Run `setup-runelight` first.
