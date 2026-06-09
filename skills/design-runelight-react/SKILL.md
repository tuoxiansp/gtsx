---
name: design-runelight-react
description: Create and iterate product GUI design drafts for React Runelight projects using Studio design frames in project.entryRoot/design/*.g.tsx. Use when the user asks for design exploration, UI drafts, visual prototypes, making a product surface look good, or adjusting an existing Runelight design board in a React project.
---

# Design Runelight React

Use this framework-specific skill when the user wants an AI-assisted product/UI design pass inside a React Runelight workspace. Setup installs this skill for React projects; for Vue projects use `design-runelight-vue`.

Maintenance note: keep the Design Loop and Quality Gate semantically aligned with the Vue design skill. Framework file contracts may differ; design judgment should not.

## User Flow

The user talks to the local agent. The agent edits local React design frames. Studio renders the design board.

1. User asks for a design draft, visual direction, or design adjustment.
2. Agent studies the product context and turns the request into a concrete design brief.
3. Agent creates or updates one or more `.g.tsx` design frames under `project.entryRoot/design`.
4. User opens the Studio design workspace, compares frames, gives feedback, and iterates.

## File Contract

- Put React design drafts in `project.entryRoot/design/<FrameName>.g.tsx`, where `project.entryRoot` comes from `runelight.config.ts`.
- If `project.entryRoot` is missing or the design directory is unavailable, setup is incomplete; use `setup-runelight` before writing design frames.
- Each design file should default-export one React component and expose one design frame named `live`.
- Multiple alternatives are multiple files, not multiple frame keys. Use names such as `CheckoutFlowCalm.g.tsx`, `CheckoutFlowDense.g.tsx`, and `CheckoutFlowEditorial.g.tsx`.
- Prefer self-contained TSX. Import existing design-system CSS, tokens, or simple presentational components only when they are stable in preview.
- Do not write screenshots, serialized DOM, runtime state, or generated layout positions into the repo.
- Treat `.runelight/preview-entries.ts` and other adapter outputs as generated. Do not put design drafts under `.runelight/`.
- A design frame is not formal component coverage. It usually shows one strong happy path; production states are modeled later by component frames.
- Avoid ordinary React app hooks inside design frame components. If an interaction state matters for the visual direction, create another design frame or model the chosen state statically instead of adding `useState`, `useEffect`, queries, routers, or production providers.

## Reference Scope

`DESIGN_REFERENCE.md` is an aesthetic reference only. Use it for taste, hierarchy, layout discipline, anti-default rules, accessibility checks, and visual critique. It does not override the React project, the existing host, or the Runelight frame contract.

Minimal frame:

```tsx
"use client"

import type { GFrames } from "@runelight/core"

export default function CheckoutFlowConcept() {
  return <main>{/* visual draft */}</main>
}

CheckoutFlowConcept.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
```

## Design Loop

Do not rely on a stronger prompt to produce a better design. Treat the user's prompt as a seed, then run a design loop that turns product context into a concrete frame.

1. **Context scan**: inspect the target app, nearby screens, existing components, visual tokens, icons, copy tone, navigation context, and likely viewport.
2. **Intent expansion**: convert the request into a compact private brief: goal, audience, core job, product surface, content model, interaction weight, constraints, and taste.
3. **Direction gate**: ask one clarifying question only when the missing choice changes the product direction. Otherwise make a visible assumption and proceed.
4. **Happy-path selection**: choose the one moment that best communicates the feature's value. Design exploration is not exhaustive state coverage.
5. **Design reference pass**: for substantive visual work, read [`DESIGN_REFERENCE.md`](./DESIGN_REFERENCE.md), choose a concrete visual direction, and apply the relevant surface rules. Use it as an aesthetic reference, not as a substitute for product context, the existing React host, or the Runelight frame contract.
6. **Visual/layout plan**: decide the visual anchor, aesthetic family, information hierarchy, primary action, secondary actions, data density, and visual system before writing TSX.
7. **Frame drafting**: create or update named `.g.tsx` design frames with credible content and stable dimensions.
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

## Alternatives

- If the user asks for broad exploration, create 2-3 named `.g.tsx` files with distinct concepts.
- If the user asks for a precise tweak, update the current frame instead of creating a new one.
- If product direction is ambiguous, ask one question or create named alternatives only when the user explicitly wants exploration.
- If there is an existing design system, reuse its tokens, components, icon style, typography, radius, shadows, and interaction patterns.
- If there is no stable design system, define a small local system inside the frame: 2-3 semantic colors, type scale, spacing rhythm, surface treatment, and icon rules.
- If backend, data, payment, policy, or safety details are unknown, design the happy-path UI with explicit assumptions. Do not invent operational guarantees.

## Design Rules

- Design for the product problem, not for decoration. Start from what the user needs to decide, compare, enter, read, or act on.
- Match the domain: admin tools should be dense and scannable; consumer/mobile surfaces should emphasize flow, hierarchy, and touch ergonomics; marketing pages need stronger first-viewport storytelling.
- Prefer content-first layout. Use realistic labels, real empty names, plausible counts, and copy that reveals product behavior.
- Make one clear primary action per frame unless the user is explicitly exploring a decision-heavy workflow.
- Avoid generic AI UI: purple gradients by default, oversized cards everywhere, vague "modern" hero copy, decorative blobs, random glassmorphism, mismatched radii, and components that look unrelated.
- Keep the result inspectable in Studio: stable frame dimensions, no text overflow, no overlapping controls, no hidden essential UI, and enough contrast for normal reading.
- Do not hand off a generic scaffold. Revise until hierarchy, spacing, content, actions, and visual system are specific enough for the user to critique.
- For substantive visual work, use [`DESIGN_REFERENCE.md`](./DESIGN_REFERENCE.md) as the detailed web design quality checklist. Apply the surface-specific rules for product GUI, marketing pages, content pages, and interactive prototypes.

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

Start the project's dev server (for example `pnpm dev`, `npm run dev`, or `runelight serve`).

Open:

```txt
/runelight/studio#/design
/runelight?entry=app%2Frunelight%2Fdesign%2F<FrameName>.g.tsx%23default&frame=live&chrome=0
```

Replace `app%2Frunelight` with the URL-encoded `project.entryRoot` when it differs. Also run the project typecheck or `runelight check` when practical.

If Studio does not show the frame, stop and report that the design workspace is unavailable. Common causes are missing `project.entryRoot`, stale adapter-generated preview entries, or a dev server that needs restart after adding the first design frame.

## Hand-Off To The User

End with:

- The design board URL.
- The `.g.tsx` design frames created or changed.
- What was checked.
- Any known design limitations or assumptions.
