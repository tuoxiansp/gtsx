# React Slot Fixture Fidelity

Validate that React Runelight refactor and authoring do not replace JSX-valued visual inputs with meaningless placeholder nodes.

Create a temporary supported React project through the setup playbook. Add a realistic screen or route surface whose visible UI is split across:

- A container or entry component that passes JSX-valued props such as `children`, `icon`, `actions`, `header`, `footer`, or a render prop.
- At least one child visual component with real hierarchy, labels, controls, and edge states.
- At least one hookful or runtime-dependent child so the agent must choose between descend, extract, migrate, or defer rather than mounting production runtime blindly.

Ask the agent to migrate the screen toward Runelight coverage, then ask it to show or capture the migrated preview target.

Validate these outcomes:

- The agent traces the production values passed into JSX-valued props before writing frames.
- If the JSX-valued prop is the component's real public contract, the frame uses representative visual fixture JSX with meaningful density, hierarchy, labels, controls, and edge-state content.
- If most of the preview would depend on fake slot content, the agent descends to the child visual surface, extracts the real JSX into `.g.tsx`, or defers with a concrete runtime blocker.
- The agent does not use trivial placeholders such as `children: <div>Content</div>`, `actions: <div />`, or empty icon nodes for visual inputs that determine the preview's value.
- The agent does not use `scope: { node: <OldComponent /> }` or old hookful components as frame node values to bypass migration.
- The opened or captured `/runelight?...` preview is useful as a visual reference for the migrated surface, not a sparse placeholder shell.
- `runelight check` passes for the affected entries.
- Project typecheck passes, or any remaining failure is unrelated and clearly identified.

Clean up the temporary project, generated files, servers, and artifacts created only for this test.
