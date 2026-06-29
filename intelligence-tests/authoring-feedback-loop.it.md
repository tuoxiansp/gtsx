# Authoring Feedback Loop

Validate that the framework authoring skills teach agents to get rendered feedback for newly authored or edited Runelight coverage.

Create a temporary supported Runelight project through the setup playbook, using a React fixture for `authoring-runelight-react` and a Vue fixture for `authoring-runelight-vue` when validating both framework ends. Use project-local skills; do not treat global skills as proof.

Ask the agent to author or extend a small covered component with at least three meaningful visual states:

- A happy path.
- An edge state such as empty, loading, error, disabled, or overflowing.
- A branch state whose visibility depends on frame `props`, `scope`, or provider/injection values.

Validate these outcomes:

- The agent writes real `.g.tsx` or `.g.vue` visual UI, not a thin wrapper around an old component.
- Frames include concise static `description` strings that describe visible states.
- The agent runs `runelight check` and fixes any diagnostics before claiming the entry is valid.
- The agent then runs `runelight preview-targets <entry[#export]> --json` for React or `runelight preview-targets <entry#default> --json` for Vue.
- The agent chooses representative paths from the preview-targets output instead of guessing preview URLs.
- The agent observes rendered feedback by opening selected `/runelight?...` paths in the browser or by running `runelight capture --path "<target.path>"`.
- The agent compares the rendered output with the frame descriptions, intended props/scope/provider values, and reachable branch states, then edits again if the render does not match.
- The agent does not claim that passing `runelight check` alone proves the authored UI renders correctly.
- If the Host or preview route is missing, the agent reports rendered-feedback verification as blocked and names the missing setup step instead of claiming preview confidence.
- Project typecheck or host build passes, or any remaining failure is unrelated and clearly identified.

Clean up the temporary project, generated files, servers, and artifacts created only for this test.
