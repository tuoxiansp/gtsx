---
name: polish
description: Polish Runelight-covered GUI in the current workspace through an observe-edit-reobserve loop. Use when the user asks to polish, refine, improve visual quality, clean up UI details, or make an existing `.g.tsx` / `.g.vue` interface feel better.
---

# Polish GUI

Polish existing Runelight GUI surfaces. The default scope is the current workspace, with priority on user-named targets and changed `.g.tsx` / `.g.vue` surfaces.

## Contract

- A polish target is a Runelight-covered `.g.tsx` / `.g.vue` entry, exported component coordinate, frame, or derived preview path.
- Legacy design drafts can be polished only when the user explicitly names that draft surface.
- If the requested target does not resolve to Runelight coverage, report that clearly before editing.
- Default to focused visual improvements: spacing, hierarchy, density, copy fit, responsive constraints, state styling, empty/loading/error states, and frame descriptions.
- Keep product intent, framework wiring, routes, data flow, and host behavior intact.
- Every polish pass must include a real visual observation before edits and another observation after edits.

## Loop

1. Establish the target:
   - Run `git status --short`.
   - Use the user's target when provided.
   - Otherwise identify changed UI with `runelight changes --json --ui-only`.
   - Resolve route, screen, or component names to `.g` entries with `rg`, Studio manifest data, or repository conventions.
2. Observe:
   - Use paged `runelight preview-targets --json <entry[#export]>` to get preview paths; the default page is 20 targets.
   - Read each target's path nodes and frame descriptions to choose representative paths.
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
