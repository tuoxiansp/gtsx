---
name: polish
description: Polish Runelight-covered GUI through a required explicit sync before editing, then an observe-edit-reobserve loop. Use when the user asks to polish, refine, improve visual quality, clean up UI details, or make an existing `.g.tsx` / `.g.vue` interface feel better.
---

# Polish GUI

Polish existing Runelight GUI surfaces. Favor user-named targets and changed `.g.tsx` / `.g.vue` surfaces. A polish pass can range from detail-level refinement to structural UI redesign when the user's intent or visual observation shows that the current information architecture is the problem. Keep it grounded in real Runelight preview or capture output.

## Invariants

- A polish target is a Runelight-covered `.g.tsx` / `.g.vue` entry, exported component coordinate, frame, or derived preview path.
- If the requested target does not resolve to Runelight coverage, report that clearly before editing.
- If the target resolves but the preview is mostly fake slot/mock content, such as JSX-valued props rendered as placeholder `<div>` nodes, report a coverage fidelity problem before visual polish. Use the authoring/refactor workflow to replace placeholder fixtures with representative visual inputs, or descend/extract the real child surface.
- Default to focused visual improvements: spacing, hierarchy, density, copy fit, responsive constraints, state styling, empty/loading/error states, and frame descriptions.
- Escalate to structural polish only when needed or requested: information architecture, grouping, navigation, panel layout, hierarchy between product surfaces, or screen-level task flow. Treat it as a larger polish radius: name the structural hypothesis, movable surfaces, protected surfaces, and verification target in the brief.
- Keep product intent, framework wiring, routes, data flow, and host behavior intact.
- Do not expand public Runelight boundaries such as protocol concepts, CLI/config fields, routes, exports, framework ends, setup strategy, or production exposure unless the user explicitly asks for that product change.
- Every polish pass must include a real visual observation before edits and another observation after edits.
- Every polish pass must stop for explicit user confirmation before the first edit. Reading the target, observing preview, and writing a brief is preparation, not sync.

## Readiness Gate

Before treating a request as Runelight polish, check whether the project is ready:

- Look for Runelight config (`runelight.config.*`), `@runelight/*` packages, `.g.tsx` / `.g.vue` entries, and a host preview route or entry.
- If the project has no Runelight integration or no covered target, do not edit UI under the Runelight polish loop.
- Tell the user plainly that Runelight polish needs setup and coverage first.
- Recommend the next step: follow the Runelight setup playbook for an uninitialized supported project, then use the framework refactor or authoring skill to create `.g` coverage, then return to `polish`.
- Do not install or initialize Runelight automatically just because the user asked for polish; setup changes project packages and host wiring, so confirm that direction first.
- If the user explicitly wants ordinary non-Runelight UI work instead, continue as a normal frontend task, but do not claim Runelight preview/capture verification.

## Required Sync

Before editing, read enough local context to avoid asking questions the project can answer:

- `git status --short` and the relevant diff, especially existing user changes.
- The target `.g` files, frame descriptions, component styles, nearby design language, and any user-named preview or capture target.
- Related docs or skills only when the polish could affect workflow, product language, or Runelight contract meaning.

After observation, always stop before the first edit. Give a compact sync brief with the observed issue, recommended direction, protected behavior, non-goals, and verification target, then ask whether to proceed. The user must answer before edits begin.

This sync is required for every Runelight polish pass, including narrow fixes such as overflow, clipped controls, broken spacing, contrast failures, or one-frame responsive bugs. Narrow fixes may use a one-sentence sync, but they still need confirmation.

Do not treat a polish brief as user confirmation. Do not say sync was done implicitly. If a new visual direction, scope expansion, product boundary, framework wiring change, data-flow change, route behavior change, public copy promise, or setup strategy change appears after confirmation, stop for another explicit sync before continuing.

For the required sync question:

- Ask one question at a time and wait.
- Include your recommended answer in natural language.
- Do not use a fixed question pool.
- Do not use a heavy audit template.
- Do not ask what code, docs, preview output, or existing design language can answer.
- Stop as soon as the work is actionable, even if fewer than five questions were asked.
- Ask no more than five questions total before the first edit.

Before the first edit, give a compact polish sync. Include only what matters:

```md
Polish sync:
- Scope: ...
- Priority: ...
- Protect: ...
- Non-goals: ...
- Verify with: ...

Proceed with this polish direction?
```

For narrow, low-risk polish, the sync may be one short sentence:

```md
Polish sync: I saw the label clip in the compact frame; I will only adjust spacing and wrapping, preserve props/data flow/routes, and verify the same preview path plus `runelight check`. Proceed?
```

## Loop

1. Establish the target:
   - Run `git status --short`.
   - Use the user's target when provided.
   - If the target is already a preview path, use it directly.
   - If the target is a `.g` entry or exported component coordinate, treat it as the visual subject, not automatically as the observation root.
   - Prefer context-first observation: find the nearest meaningful covered app/screen/parent entry that renders the target, then observe the target inside that full UI tree. Components often rely on parent layout, density, container width, theme wrappers, or sibling controls for their real appearance.
   - For a named `.g` entry or coordinate, first run `runelight containing-frames <entry[#export]> --json`. Prefer contexts whose `root.coordinate` differs from the target. If every returned root is the target, treat it as target-level coverage, not broader app/screen context.
   - If no ancestor context is available, look for covered ancestors with `rg` imports/usages, nearby route/screen `.g` entries, changed parent `.g` files, and `runelight inspect <entry[#export]> --json` on likely app/screen entries. Do not exhaustively rediscover the whole workspace when the parent is obvious.
   - Use isolated component preview only when no covered ancestor exists, when the user explicitly asks for isolated inspection, or when debugging the component's own frame contract.
   - Otherwise collect changed `.g.tsx` / `.g.vue` files from Git status first.
   - When there are many changed `.g` candidates or the user asks for changed visual surfaces, use `runelight changes --json --ui-only` to narrow the candidate list.
   - For a selected entry, `runelight changes --json --component <entry[#export]>` is optional frame-status feedback; do not use it as the source of preview URLs.
   - If component-level `changes` returns JSON with diagnostics for the selected entry, keep those diagnostics as local feedback and continue to `preview-targets` when preview paths are still available.
   - Resolve route, screen, or component names to `.g` entries with `rg`, static analysis output, or repository conventions.
2. Observe:
   - Use paths from `runelight containing-frames` when available; otherwise use paged `runelight preview-targets <entry[#export]> --json` on the selected observation root to get preview paths. The default `preview-targets` page is 20 targets.
   - Read each target's path nodes and frame descriptions to choose representative paths.
   - When polishing a child component through a parent/root entry, choose paths whose `paths` nodes include both the parent state and the target child state. Use child frame overrides already encoded by `preview-targets` instead of hand-building URLs.
   - If the relevant parent/root paths are unavailable, say that context observation is blocked and fall back to isolated preview only with that caveat.
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
- Placeholder slot or node fixtures that make the preview too sparse to be a useful reference.

## Report

Summarize:

- Target surfaces and preview paths inspected.
- Visual issues found.
- Changes made.
- Verification commands and skipped checks.
