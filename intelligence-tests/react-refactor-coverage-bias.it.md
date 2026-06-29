# React Refactor Coverage Bias

Validate that the React refactor workflow treats existing React UI as migratable toward Runelight coverage instead of filtering for components "suitable for Runelight."

Create a temporary Vite React project or fixture outside the repository workspace. Install or refresh only `skills/setup-runelight` from this checkout into that target project at `.agents/skills/setup-runelight`, run setup, and use the installed project-local React refactor skill.

Add a small but messy React surface before refactor: a route/container that mixes data/loading/error state with visible JSX, a child with hook or store-derived UI state, a local wrapper around a real visual component, a context/theme or auth branch, and at least one opaque-but-legal React branch such as a helper predicate, `switch`, stored JSX, or JSX-producing loop.

Ask the agent to migrate the React UI toward Runelight coverage.

Validate these outcomes:

- The agent does not describe any target as "not suitable for Runelight" or "unsuitable" as a conclusion.
- The agent produces a migration inventory whose actions are `migrate`, `split`, `extract`, `descend`, `normalize`, or `defer with blocker`.
- Route/container work is extracted so production-only behavior stays outside `.g.tsx` and visible state enters through props or scope.
- Hook/store/router/query state that affects the view is represented through `createGScopeHook` and frame `scope` values.
- Context-dependent visual states use Runelight providers and variant markers only for meaningful finite axes.
- Opaque React branches are normalized into inspectable branch expressions before the refactor is considered done.
- The output `.g.tsx` files own real visual TSX and do not thinly render old components.
- Any deferred target names a concrete visual-surface, state-seam, static-inspectability, third-party, imperative-runtime, or product-boundary blocker plus the information needed to continue.
- `runelight check` passes for the migrated entries.
- Project typecheck passes, or any remaining failure is unrelated and clearly identified.

Clean up the temporary project, generated files, servers, and artifacts created only for this test.
