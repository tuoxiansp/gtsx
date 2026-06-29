---
name: polish
description: Polish Runelight-covered GUI through a lightweight alignment gate and an observe-edit-reobserve loop. Use when the user asks to polish, refine, improve visual quality, clean up UI details, or make an existing `.g.tsx` / `.g.vue` interface feel better.
---

# Polish GUI

Polish existing Runelight GUI surfaces. Favor user-named targets and changed `.g.tsx` / `.g.vue` surfaces. A polish pass can range from detail-level refinement to structural UI redesign when the user's intent or visual observation shows that the current information architecture is the problem. Keep it grounded in real Runelight preview or capture output.

## Invariants

- A polish target is a Runelight-covered `.g.tsx` / `.g.vue` entry, exported component coordinate, frame, or derived preview path.
- If the requested target does not resolve to Runelight coverage, report that clearly before editing.
- Default to focused visual improvements: spacing, hierarchy, density, copy fit, responsive constraints, state styling, empty/loading/error states, and frame descriptions.
- Escalate to structural polish only when needed or requested: information architecture, grouping, navigation, panel layout, hierarchy between product surfaces, or screen-level task flow. Treat it as a larger polish radius: name the structural hypothesis, movable surfaces, protected surfaces, and verification target in the brief.
- Keep product intent, framework wiring, routes, data flow, and host behavior intact.
- Do not expand public Runelight boundaries such as protocol concepts, CLI/config fields, routes, exports, framework ends, setup strategy, or production exposure unless the user explicitly asks for that product change.
- Every polish pass must include a real visual observation before edits and another observation after edits.

## Readiness Gate

Before treating a request as Runelight polish, check whether the project is ready:

- Look for Runelight config (`runelight.config.*`), `@runelight/*` packages, `.g.tsx` / `.g.vue` entries, and a host preview route or entry.
- If the project has no Runelight integration or no covered target, do not edit UI under the Runelight polish loop.
- Tell the user plainly that Runelight polish needs setup and coverage first.
- Recommend the next step: run `setup-runelight` for an uninitialized supported project, then use the framework refactor or authoring skill to create `.g` coverage, then return to `polish`.
- Do not install or initialize Runelight automatically just because the user asked for polish; setup changes project packages and host wiring, so confirm that direction first.
- If the user explicitly wants ordinary non-Runelight UI work instead, continue as a normal frontend task, but do not claim Runelight preview/capture verification.

## Lightweight Sync

Before editing, read enough local context to avoid asking questions the project can answer:

- `git status --short` and the relevant diff, especially existing user changes.
- The target `.g` files, frame descriptions, component styles, nearby design language, and any user-named preview or capture target.
- Related docs or skills only when the polish could affect workflow, product language, or Runelight contract meaning.

Ask the user only when guessing would be expensive: likely visual rework, scope drift, product-boundary movement, contract damage, unclear protection constraints, or unclear verification. Ask zero questions when the path is obvious.

When a question is needed:

- Ask one question at a time and wait.
- Include your recommended answer in natural language.
- Do not use a fixed question pool.
- Do not use a heavy audit template.
- Do not ask what code, docs, preview output, or existing design language can answer.
- Stop as soon as the work is actionable, even if fewer than five questions were asked.
- Ask no more than five questions total before forming a brief.

Before the first edit, give a compact polish brief. Include only what matters:

```md
Polish brief:
- Scope: ...
- Priority: ...
- Protect: ...
- Non-goals: ...
- Verify with: ...
```

For narrow, low-risk polish, the brief may be one short sentence.

## Loop

1. Establish the target:
   - Run `git status --short`.
   - Use the user's target when provided.
   - If the target is already a `.g` entry, exported component coordinate, or preview path, do not rediscover the whole workspace.
   - Otherwise collect changed `.g.tsx` / `.g.vue` files from Git status first.
   - When there are many changed `.g` candidates or the user asks for changed visual surfaces, use `runelight changes --json --ui-only` to narrow the candidate list.
   - For a selected entry, `runelight changes --json --component <entry[#export]>` is optional frame-status feedback; do not use it as the source of preview URLs.
   - If component-level `changes` returns JSON with diagnostics for the selected entry, keep those diagnostics as local feedback and continue to `preview-targets` when preview paths are still available.
   - Resolve route, screen, or component names to `.g` entries with `rg`, static analysis output, or repository conventions.
2. Observe:
   - Use paged `runelight preview-targets --json <entry[#export]>` to get preview paths; the default page is 20 targets.
   - Read each target's path nodes and frame descriptions to choose representative paths.
   - If a component-level `changes` report is available, prefer added or changed root frames before unchanged frames, then use `preview-targets` output to open the actual paths.
   - Open or capture only the targets needed to judge the polish work; do not review every generated target by default.
   - Open selected paths in the browser, or capture them with `runelight capture --path "<target.path>"`.
   - Check responsive states when the surface is viewport-sensitive.
3. Edit:
   - Make the smallest coherent batch of visual changes.
   - Prefer existing local components, tokens, layout patterns, and CSS conventions.
   - Add or improve static frame `description` strings when they help agents choose preview targets.
4. Re-observe:
   - Re-open or re-capture the same paths.
   - Compare against the earlier observation.
   - Repeat the loop while a concrete visual issue remains.
5. Verify:
   - Run `runelight check` for affected entries or the configured project.
   - Run typecheck or targeted tests when touched code requires it.

## Review Lens

Look for:

- Text overflow, cramped wrapping, or labels competing with controls.
- Weak hierarchy between primary action, secondary action, and content.
- Inconsistent spacing between sibling sections.
- Controls that shift size between states.
- Missing or unclear hover, focus, disabled, loading, empty, and error states.
- Low contrast or decorative effects that reduce inspectability.
- Child-frame targets whose parent preview shows no meaningful visual change.

## Report

Summarize:

- Target surfaces and preview paths inspected.
- Visual issues found.
- Changes made.
- Verification commands and skipped checks.
