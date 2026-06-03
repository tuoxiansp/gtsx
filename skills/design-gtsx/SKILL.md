---
name: design-gtsx
description: Create and iterate ordinary product design drafts inside a gtsx project using local project.root/gtsx/design frames and Studio's design workspace. Use when the user asks for design exploration, UI drafts, visual prototypes, direct TSX design, making a product surface look good, or adjusting an existing gtsx design board without explicitly requesting the high-quality image-first workflow.
---

# Design gtsx

Use this skill when the user wants an AI-assisted product/UI design pass inside an existing gtsx-enabled workspace and has not explicitly asked for the high-quality image-first workflow.

This is the ordinary direct-code design skill. Do not silently decide to generate design reference images. If the user wants a high-quality image-first process, use `design-gtsx-high-quality` instead and make that workflow explicit to the user.

## User Flow

The user talks to the local agent. The agent edits local files. Studio renders the board.

1. User asks for a design draft, visual direction, or design adjustment.
2. Agent reads `gtsx.config.ts` and writes or edits one or more `project.root/gtsx/design/*.g.tsx` files.
3. User opens `/gtsx/studio#/design`.
4. Each design file appears as a draggable frame. Frame positions are stored in browser `localStorage`.

## File Contract

- Put design drafts in `project.root/gtsx/design/<FrameName>.g.tsx`, where `project.root` comes from `gtsx.config.ts` and defaults to `src`.
- Each frame is one default-exported React component with one happy-path frame named `live`.
- Prefer self-contained files. Do not split a design frame into sibling helper files unless the target adapter is known to resolve them in preview.
- Multiple alternatives are separate files, not multiple frames.
- Do not write screenshots, serialized DOM, runtime state, or generated layout positions into the repo.
- Treat `.gtsx/` as generated adapter output that may be ignored, but never ignore `project.root/gtsx/design/`.

Minimal frame:

```tsx
"use client"

import type { GFrames } from "@gtsx/core"

export default function CheckoutDesign() {
  return <main>{/* real visual TSX */}</main>
}

CheckoutDesign.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
```

## Design Loop

Do not rely on a stronger prompt to produce a better design. Treat the user's prompt as a seed, then run a design loop that turns product context into a concrete frame.

1. **Context scan**: inspect the target app, nearby screens, existing components, CSS variables, tokens, icons, copy tone, route shape, and likely viewport.
2. **Intent expansion**: convert the request into a compact private brief: goal, audience, core job, product surface, content model, interaction weight, constraints, and taste.
3. **Direction gate**: ask one clarifying question only when the missing choice changes the product direction. Otherwise make a visible assumption and proceed.
4. **Happy-path selection**: choose the one moment that best communicates the feature's value. Design exploration is not exhaustive frame coverage.
5. **Design reference pass**: for substantive visual work, read [`DESIGN_REFERENCE.md`](./DESIGN_REFERENCE.md), choose a concrete visual direction, and apply the relevant surface rules. Use it as a web design quality reference, not as a substitute for product context.
6. **Visual/layout plan**: decide the visual anchor, aesthetic family, information hierarchy, primary action, secondary actions, data density, and visual system before writing TSX.
7. **Frame implementation**: create or update a named `project.root/gtsx/design/*.g.tsx` frame with credible content and stable dimensions.
8. **Critique/refine**: review the frame against hierarchy, clarity, rhythm, density, accessibility, affordance, and domain fit. If it looks generic or unfinished, revise before hand-off.
9. **Iteration**: if the user says "adjust here/there", preserve the current direction and edit the relevant frame unless they ask for a variant.

## Short Prompt Method

For a short request like "design a gift feature", infer enough product design context to make a first frame worth reacting to:

- **Product surface**: the screen, component, data, and actions the user will judge visually.
- **Context of use**: who is using it, in what moment, and what outcome the UI supports.
- **Interaction weight**: whether the feature should feel lightweight, committed, social, transactional, playful, or operational.
- **Taste constraints**: target device, density, visual tone, color restraint, copy style, and what the design must avoid.
- **Happy path**: the one moment that best communicates the feature's value.

State the key assumptions briefly in the user-facing update, then implement. Keep the assumptions concrete enough that the user can correct them in the next turn.

## Edge Frames

- If the user asks for broad exploration, create 2-3 named frame files with distinct concepts.
- If the user asks for a precise tweak, update the current frame instead of creating a new one.
- If product direction is ambiguous, ask one question or create named alternatives only when the user explicitly wants exploration.
- If there is an existing design system, reuse its tokens, components, icon style, typography, radius, shadows, and interaction patterns.
- If there is no stable design system, define a small local system inside the frame: 2-3 semantic colors, type scale, spacing rhythm, surface treatment, and icon rules.
- If backend, data, payment, policy, or safety details are unknown, design the happy-path UI with explicit assumptions. Do not invent operational guarantees.
- If preview cannot resolve sibling helper files, keep the frame self-contained.

## Design Rules

- Design for the product problem, not for decoration. Start from what the user needs to decide, compare, enter, read, or act on.
- Match the domain: admin tools should be dense and scannable; consumer/mobile surfaces should emphasize flow, hierarchy, and touch ergonomics; marketing pages need stronger first-viewport storytelling.
- Prefer content-first layout. Use realistic labels, real empty names, plausible counts, and copy that reveals product behavior.
- Make one clear primary action per frame unless the user is explicitly exploring a decision-heavy workflow.
- Avoid generic AI UI: purple gradients by default, oversized cards everywhere, vague "modern" hero copy, decorative blobs, random glassmorphism, mismatched radii, and components that look unrelated.
- Keep the result inspectable in Studio: stable frame dimensions, no text overflow, no overlapping controls, no hidden essential UI, and enough contrast for normal reading.
- Do not hand off a generic scaffold. Revise until hierarchy, spacing, content, actions, and visual system are specific enough for the user to critique.
- For substantive visual work, use [`DESIGN_REFERENCE.md`](./DESIGN_REFERENCE.md) as the detailed web design quality checklist. Apply the surface-specific rules for product GUI, marketing pages, content pages, and interactive prototypes.
- Do not use image generation in this ordinary workflow. Image-first visual exploration belongs to `design-gtsx-high-quality` and should be explicit to the user.

## Prompt Handling

- If the user's request is underspecified, make one explicit assumption and proceed. Ask a clarifying question only when the missing detail changes the product direction.
- Translate vague asks into design intent before editing. Example: "make it premium" means refine hierarchy, spacing, type, color restraint, motion/interaction affordance, and content specificity.
- For precise visual edits, preserve layout unless the requested change implies structural work.
- For structural edits, update the information architecture first, then visual styling.

## Quality Gate

- Can the target user understand the screen's purpose within two seconds?
- Is the primary action obvious and reachable?
- Does the information hierarchy match the user's decision order?
- Does the visual system feel coherent across colors, type, spacing, corners, shadows, and icons?
- Does the design use existing product conventions where available?
- Are mobile/touch targets, contrast, and overflow handled?
- Would this still look intentional after real data replaces sample data?

If any answer is clearly no, revise the frame before hand-off.

## Verification

Use the project's normal preview route:

```sh
pnpm dev
```

Open:

```txt
/gtsx/studio#/design
/gtsx?entry=src%2Fgtsx%2Fdesign%2F<FrameName>.g.tsx%23default&frame=live&chrome=0
```

Also run the project typecheck when available. Replace `src` in the direct frame URL with the configured `project.root` when it differs. Design frames are expected to live under `gtsx.config.ts` `project.root`, so they should be inside the gtsx project scope by convention.

## When Setup Is Missing

If `/gtsx/studio#/design` does not show frames:

- Confirm the project is using a gtsx adapter version that includes `project.root/gtsx/design/**/*.g.tsx` in preview entries.
- Restart the dev server so generated preview entry maps refresh.
- If the project consumes `@gtsx/studio` from built `dist`, rebuild `@gtsx/studio` after source changes.

If the project is not gtsx-enabled, use `setup-gtsx` first.

## Hand-off To The User

End with:

- The design board URL.
- The frame files created or changed.
- Any verification commands run.
- Any known limitations, especially if a frame was kept self-contained because preview cannot resolve helper siblings.
