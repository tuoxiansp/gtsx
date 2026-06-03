# gtsx Design Workspace

Use Studio as a scratchpad for product design exploration — without the formality of component coverage.

The full agent workflow lives in [`skills/design-gtsx/SKILL.md`](../skills/design-gtsx/SKILL.md). This document explains the concept and the file contract for humans.

---

## What This Is

The design workspace is a lightweight surface inside Studio for AI-assisted product design drafts. It shares the same preview route and the same Studio shell, but it is deliberately separate from formal component coverage.

The difference:

| | Component `.g.tsx` | Design frame |
|---|---|---|
| **Purpose** | Cover all meaningful visual states | Explore one happy path |
| **Frames** | Multiple, named by visual state | One: `live` |
| **Alternatives** | Multiple frames in one file | Multiple files |
| **Scope** | Production component model | Scratch iteration |
| **Style** | May import shared code | Prefer self-contained |

## How It Works

1. You describe what you want to a local agent.
2. The agent writes or edits a `.g.tsx` frame in `project.root/gtsx/design/`.
3. You open `/gtsx/studio#/design`.
4. Each file appears as a draggable frame on a canvas. Positions are stored in your browser's `localStorage` — nothing is written to the repo.

## Frame Contract

- Location: `project.root/gtsx/design/<FrameName>.g.tsx` (where `project.root` comes from `gtsx.config.ts`, defaults to `src`).
- One default-exported React component per file.
- One frame named `live`.
- Multiple alternatives = multiple files, not multiple frames.
- Prefer self-contained TSX — quick drafts shouldn't depend on fragile helper resolution.
- Never write screenshots, serialized DOM, or layout positions into the repo.

Minimal frame:

```tsx
"use client"

import type { GFrames } from "@gtsx/core"

export default function CheckoutFlow() {
  return <main>{/* visual draft */}</main>
}

CheckoutFlow.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
```

## Opening It

The design board:

```
/gtsx/studio#/design
```

A single frame directly:

```
/gtsx?entry=src%2Fgtsx%2Fdesign%2FCheckoutFlow.g.tsx%23default&frame=live&chrome=0
```

Replace `src` with your configured `project.root` if it differs.

## The Agent's Design Loop

The quality of a design frame doesn't depend on how well you word the prompt. The agent runs a loop:

1. **Context scan** — inspects your existing product: styles, tokens, components, copy tone, viewport.
2. **Intent expansion** — turns your request into a brief: goal, audience, core job, constraints.
3. **Direction gate** — asks one clarifying question only if the missing detail would change the product direction. Otherwise makes an explicit assumption and proceeds.
4. **Layout plan** — decides hierarchy, primary action, density, visual system.
5. **Frame implementation** — writes a self-contained `.g.tsx` file with realistic content.
6. **Critique** — reviews against clarity, rhythm, domain fit, accessibility. Revises if generic.

You see the result in Studio and react: "adjust this", "try a different approach", "make it denser". The agent iterates on the same frame or creates alternatives as separate files.

## When It Doesn't Work

- **Frames don't appear in Studio?** Restart the dev server so generated preview entries refresh.
- **Resolution errors?** Keep frames self-contained. If a sibling helper file can't be resolved in preview, inline the dependency.
- **Project not gtsx-enabled?** Run `setup-gtsx` first.
