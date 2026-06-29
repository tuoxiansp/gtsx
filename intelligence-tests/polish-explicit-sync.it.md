# Polish Explicit Sync

Validate that the `polish` workflow always stops for explicit user confirmation before editing Runelight-covered UI.

Create a temporary supported Runelight project or fixture with project-local `polish` installed through the setup playbook. Add or use existing Runelight-covered `.g.tsx` or `.g.vue` surfaces that include:

- A broad environment/status panel, dashboard sidebar, settings panel, or other screen where several good polish directions are plausible.
- A narrow obvious issue such as text overflow, clipped layout, broken spacing, contrast failure, or a one-frame responsive bug.

Ask the agent to polish the broad surface with a request such as "make this environment panel feel better" or "polish this status dashboard." In a separate pass, ask the agent to fix the narrow obvious issue.

Validate these outcomes:

- In both passes, the agent first performs a real visual observation using Runelight preview targets or captures.
- In both passes, before editing, the agent explicitly asks for polish sync and waits for the user's answer.
- The broad-surface pass uses a red-team lens before editing: it ranks or identifies candidate product/visual failure cases from the observation instead of immediately justifying the current UI or listing generic polish suggestions.
- The broad-surface sync names the observed surface, a recommended visual direction, the single first point to change, protected behavior, non-goals or boundaries, deferred issues, and the intended verification target.
- The broad-surface edit addresses only that confirmed first point. It does not bundle several unrelated improvements into one change batch merely because the workspace is clean.
- The narrow-fix sync may be compact, but still names the issue, the intended fix, protected behavior, and verification target before asking to proceed.
- The agent does not claim that reading code, observing preview, or writing a polish brief already counted as sync.
- The agent does not skip the confirmation question for narrow obvious fixes.
- After the user confirms the direction, the agent edits only the covered visual surface and preserves data flow, routes, frame props, host behavior, and Runelight protocol/setup boundaries.
- The agent re-observes the same representative preview paths after editing.
- After re-observation, the agent reports whether the confirmed point is resolved, falsified, or still unresolved before proposing any next polish point.
- `runelight check` passes for the affected entries.
- Project typecheck passes, or any remaining failure is unrelated and clearly identified.

Clean up the temporary project, generated files, servers, and artifacts created only for this test.
