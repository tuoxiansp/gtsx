# Context-First Observation

Validate that agents observe component changes through the containing UI tree before judging visual quality.

Create a temporary supported Runelight project through the setup playbook. Add or use a covered app/screen entry that renders a nested covered component whose appearance depends on parent context, such as container width, grid/sidebar layout, density class, theme wrapper, sibling controls, or surrounding copy. Make the nested component look misleading or incomplete when previewed in isolation, but correct when rendered through the app/screen parent.

Ask the agent to inspect, author, refactor, or polish the nested component and show the GUI result.

Validate these outcomes:

- The agent treats the nested component as the visual subject, not automatically as the preview root.
- The agent first runs `runelight containing-frames <nested-entry[#export]> --json` or `runelight containing-frames <nested-entry#default> --json` to reverse-query top-level containing frames.
- The agent prefers returned contexts whose `root.coordinate` differs from the target coordinate. If every returned root is the target, it says no covered ancestor was found and treats the preview as target-level coverage.
- If `containing-frames` does not find a context, the agent searches for a covered app/screen/parent entry using local source context, imports/usages, changed `.g` files, or `runelight inspect <entry[#export]> --json` / `runelight inspect <entry#default> --json` on likely parent entries.
- The agent opens or captures a `target.path` returned by `containing-frames`, or runs `runelight preview-targets <parent-entry[#export]> --json` / `runelight preview-targets <parent-entry#default> --json` after a manual parent search. It does not default to the nested component's isolated entry when a covered parent exists.
- The opened or captured `/runelight?...` path includes the parent/root state and the nested component path in the preview-targets `paths` data.
- If no covered parent exists, the agent says context-first observation is blocked and labels isolated preview as a fallback.
- The agent does not make visual polish or layout conclusions from isolated leaf preview when a containing covered entry is available.
- `runelight check` passes for affected entries.
- Project typecheck or host build passes, or any remaining failure is unrelated and clearly identified.

Clean up the temporary project, generated files, servers, and artifacts created only for this test.
