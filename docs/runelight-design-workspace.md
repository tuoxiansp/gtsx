# Runelight Design Workspace

Use Studio as a scratchpad for product design exploration — without the formality of component coverage.

The full agent workflow lives in [`skills/design-runelight/SKILL.md`](../skills/design-runelight/SKILL.md). This document explains the concept and the file contract for humans.

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
2. The agent writes or edits a `.g.tsx` frame in `project.entryRoot/design/`.
3. You open `/runelight/studio#/design`.
4. Each file appears as a draggable frame on a canvas. Positions are stored in your browser's `localStorage` — nothing is written to the repo.

## Frame Contract

- Location: `project.entryRoot/design/<FrameName>.g.tsx`, where `project.entryRoot` is the local `/runelight` entry directory recorded by setup.
- One default-exported React component per file.
- One frame named `live`.
- Multiple alternatives = multiple files, not multiple frames.
- Prefer self-contained TSX — quick drafts shouldn't depend on fragile helper resolution.
- Never write screenshots, serialized DOM, or layout positions into the repo.

Minimal frame:

```tsx
"use client"

import type { GFrames } from "@runelight/core"

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
/runelight/studio#/design
```

A single frame directly:

```
/runelight?entry=app%2Frunelight%2Fdesign%2FCheckoutFlow.g.tsx%23default&frame=live&chrome=0
```

Replace `app%2Frunelight` with the URL-encoded `project.entryRoot` if setup chose a different entry root, such as `src%2Fapp%2Frunelight`.

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

- **Frames don't appear in Studio?** Confirm `project.entryRoot` is set in `runelight.config.ts`, then make sure the adapter-generated preview entries have refreshed and reload Studio.
- **Resolution errors?** Keep frames self-contained. If a sibling helper file can't be resolved in preview, inline the dependency.
- **Project not Runelight-enabled?** Run `setup-runelight` first.
