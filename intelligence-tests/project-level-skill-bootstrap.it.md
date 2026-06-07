# Project-Level Skill Bootstrap

Validate the Runelight skill installation flow from a clean project, without relying on globally installed Runelight skills.

Use one temporary Vite React TypeScript project and one temporary Vite Vue 3 TypeScript project outside this repository workspace. Start each project without any `.agents/skills` directory. Use the README installer prompt as the user-facing entry point: install or refresh only `skills/setup-runelight` from this checkout into the target project at `.agents/skills/setup-runelight`, then run that project-level `setup-runelight` skill.

Validate these outcomes in the React project:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup wires a working Runelight integration for the React host.
- Setup installs or refreshes only the React companion skills needed for that project: `authoring-runelight-react`, `refactor-to-runelight`, and `design-runelight`.
- Setup does not install `authoring-runelight-vue` or the deprecated unsplit `authoring-runelight`.
- The README prompt and setup report do not instruct the agent to install the full Runelight skill set globally.
- `runelight check`, the project typecheck/build, `/runelight/studio/manifest`, and at least one preview URL work for a `.g.tsx` entry.

Validate these outcomes in the Vue project:

- Before setup runs, the project contains `.agents/skills/setup-runelight` and no other Runelight project-level skills.
- Setup wires a working Runelight integration for the Vue host.
- Setup installs or refreshes only the Vue companion skill needed for that project: `authoring-runelight-vue`.
- Setup does not install `authoring-runelight-react`, `refactor-to-runelight`, `design-runelight`, or the deprecated unsplit `authoring-runelight`.
- The generated Vue frame examples or guidance use `props` and `scope`, never `bindings`.
- `runelight check`, the project typecheck/build, `/runelight/studio/manifest`, and at least one preview URL work for a `.g.vue` entry.

Across both projects, verify that the test did not write Runelight companion skills into the user's global skills directory. If the environment already has global Runelight skills installed, do not treat them as proof of success; use project-local `.agents/skills` contents and file timestamps or an isolated temporary home when available.

Clean up the temporary projects, dev servers, generated files, and any isolated temporary skill home created for this test.
