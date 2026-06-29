# Agent UI Workflow

Validate the agent-facing authoring, refactor, context-first observation, and polish workflows in one continuous Runelight-covered UI project. Create a temporary supported Vite React project through the setup playbook and use only its project-local companion skills. Add a realistic route or screen with loading/error/data state, hook or store-derived view state, context/theme or auth branches, JSX-valued visual props, a nested covered child whose correct appearance depends on parent context, a broad polish surface, and one narrow visual defect.

Ask the agent to migrate the screen toward Runelight coverage, extend it with additional states, show or capture the rendered result, and then polish the broad surface and the narrow defect.

Validate these outcomes:

- The agent does not reject targets as "unsuitable for Runelight"; its migration inventory uses actions such as `migrate`, `split`, `extract`, `descend`, `normalize`, or `defer with blocker`.
- Route/container behavior stays outside `.g.tsx`; visible runtime state enters through frame `props`, `scope`, or providers.
- Hook/store/router/query state that affects visible UI is modeled with `createGScopeHook` and frame `scope`; context-dependent visual state uses finite Runelight provider axes.
- Opaque React control flow is normalized into inspectable branches before the refactor is considered complete.
- The resulting `.g.tsx` files own real visible TSX and are not thin wrappers around old hookful components.
- JSX-valued props such as `children`, `icon`, `actions`, `header`, `footer`, or render props use representative visual fixture JSX when they are the real public contract. The agent does not use trivial placeholders or `scope` nodes that mount old components to bypass migration.
- Authored frames include concise static `description` strings and cover a happy path, an edge state, and a branch state driven by explicit frame inputs.
- The agent runs `runelight check`, then `runelight preview-targets <entry[#export]> --json`, chooses representative returned paths instead of guessing URLs, opens or captures them, compares the render against frame descriptions and inputs, and edits again if the render does not match.
- For the nested child, the agent first uses `runelight containing-frames <nested-entry[#export]> --json` or a documented parent search with `runelight inspect`, prefers a covered parent/root context when one exists, and does not make visual quality judgments from an isolated leaf preview when a containing frame is available.
- If no covered parent exists, the agent names context-first observation as blocked and labels isolated preview as a fallback.
- Before both the broad polish pass and the narrow fix, the agent performs real visual observation, asks for explicit polish sync, waits for confirmation, names the surface, first point to change, protected behavior, non-goals or boundaries, and verification target, then edits only the confirmed point.
- After polish edits, the agent re-observes the same representative preview paths and reports whether the confirmed point is resolved, falsified, or still unresolved before proposing another point.
- `runelight check` and project typecheck or host build pass, or any remaining failure is unrelated and clearly identified.

In the same test run, validate Vue authoring feedback with the Vite Vue project from the setup matrix or a fresh temporary Vue project through the same setup playbook: create or extend one `.g.vue` component with props, scope, and provider/injection-driven visible states, then verify `runelight check`, `preview-targets`, and rendered preview feedback before claiming success.

Clean up temporary projects, generated files, servers, browser captures, and artifacts created only for this test.
