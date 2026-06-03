---
name: design-gtsx-high-quality
description: Create high-quality gtsx design drafts through an explicit image-first workflow: generate or use visual reference images, inspect them directly, implement project.root/gtsx/design frames, then iterate by screenshot comparison. Use only when the user explicitly asks for high quality, image-first design, generated visual references, design-reference fidelity, or invokes this skill by name.
---

# Design gtsx high quality

Use this skill when the user explicitly wants a high-quality visual design pass inside an existing gtsx-enabled workspace and accepts an image-first workflow.

This skill is intentionally separate from `design-gtsx`. Do not silently choose it just because image generation is available. When this skill is used, state plainly that the workflow will generate or use visual reference images, translate them into `.g.tsx`, and refine by screenshot comparison.

## User Flow

The user talks to the local agent. The agent creates visual references, edits local files, and uses Studio/browser screenshots to compare the implementation against the reference.

1. User explicitly asks for high-quality design, image-first work, reference-image fidelity, or invokes `design-gtsx-high-quality`.
2. Agent reads `gtsx.config.ts` and writes or edits one or more `project.root/gtsx/design/*.g.tsx` files.
3. Agent uses image generation or user-provided images as visual references.
4. Agent previews the gtsx frame and iterates by comparing the implementation screenshot with the reference image.
5. User opens `/gtsx/studio#/design`.

## File Contract

- Put design drafts in `project.root/gtsx/design/<FrameName>.g.tsx`, where `project.root` comes from `gtsx.config.ts` and defaults to `src`.
- Each frame is one default-exported React component with one happy-path frame named `live`.
- Prefer self-contained files. Do not split a design frame into sibling helper files unless the target adapter is known to resolve them in preview.
- Multiple alternatives are separate files, not multiple frames.
- Do not write serialized DOM, runtime state, or generated layout positions into the repo.
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

## High-quality Workflow

1. **Context scan**: inspect the target app, nearby screens, existing components, CSS variables, tokens, icons, copy tone, route shape, and likely viewport.
2. **Explicit workflow notice**: tell the user you are using the high-quality image-first workflow. Keep it short.
3. **Reference generation**: read [`IMAGEGEN_REFERENCE.md`](./IMAGEGEN_REFERENCE.md), then generate or use the needed visual reference image(s). If no image generation or user-provided reference is available, say this workflow cannot run as image-first and use `design-gtsx` only if the user agrees.
4. **Reference authority**: the image remains the source of truth. Do not replace it with a text lock or a vibe summary.
5. **Image-to-gtsx pass**: read [`IMAGE_TO_GTSX_REFERENCE.md`](./IMAGE_TO_GTSX_REFERENCE.md), inspect the reference image directly, and implement the first `.g.tsx` draft.
6. **Preview capture**: open the gtsx preview route and capture the implemented frame.
7. **Visual comparison loop**: compare the reference image and implementation screenshot. Write short drift notes for the largest visible differences, then patch only those differences.
8. **Repeat**: run the screenshot comparison loop until the major structure, copy, color system, hierarchy, spacing, and visual anchors match closely enough for the requested fidelity.
9. **Handoff**: report the frame files, preview URL, reference image status, comparison passes, and remaining known differences.

## Reference Image Rules

- The reference image is authoritative. If drift notes are incomplete, re-open the image instead of inventing from memory.
- Drift notes are a working checklist, not a design spec. They should record only the most important differences found during comparison.
- Project context may fill unknowns only when the image is silent. It must not override visible reference-image copy, section structure, palette, layout, or primary visual anchors.
- Browser preview adjustments must be comparison-driven. Do not use preview time to redesign from taste or project context.
- If the generated reference is too vague, illegible, generic, crowded, or dependent on raster-only artwork that cannot be represented in gtsx, regenerate a cleaner reference before implementing.

## Visual Comparison Loop

For each pass:

1. Re-open or view the reference image.
2. Capture the current gtsx implementation screenshot.
3. Compare both visually, not from memory.
4. Note at most five biggest drifts:
   - changed or missing visible copy
   - changed information architecture
   - changed color palette or background logic
   - changed layout skeleton or spacing rhythm
   - missing visual anchor, asset slot, or component family
5. Patch the implementation to reduce those drifts.
6. Repeat from the screenshot step.

Do not claim fidelity if no reference image can be re-opened or compared against the implementation screenshot.

## Design Rules

- Read [`DESIGN_REFERENCE.md`](./DESIGN_REFERENCE.md) only as general taste support; it does not replace image comparison.
- Use [`IMAGEGEN_REFERENCE.md`](./IMAGEGEN_REFERENCE.md) to keep generated references web-GUI-reconstructable.
- Use [`IMAGE_TO_GTSX_REFERENCE.md`](./IMAGE_TO_GTSX_REFERENCE.md) to classify structural GUI, bounded assets, and simplified effects before coding.
- Do not pretend `.g.tsx` can faithfully recreate raster-only artwork. Preserve bounded assets when available, or regenerate a GUI-reconstructable reference.
- Do not simplify distinctive image structure into generic rows, cards, or default colors.

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

Also run the project typecheck when available. Replace `src` in the direct frame URL with the configured `project.root` when it differs.

## Hand-off To The User

End with:

- The high-quality workflow used.
- The reference image(s) used or generated.
- The design board URL.
- The frame files created or changed.
- The screenshot comparison passes completed.
- Remaining known differences from the reference.
- Any verification commands run.
