# Testing Runelight

## Unit and package tests

From the repository root:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Packages under `packages/` cover analyzers, adapters, CLI, and Studio.

## Intelligence tests (agent-driven E2E)

`intelligence-tests/*.it.md` are **task cards for agents**, not automated CI scripts. Each file describes outcomes to validate through real setup, dev servers, browsers, and cleanup.

| Test | Scope |
|------|-------|
| [vite-react-setup.it.md](../intelligence-tests/vite-react-setup.it.md) | Fresh Vite React setup via `setup-runelight` |
| [vite-vue-support.it.md](../intelligence-tests/vite-vue-support.it.md) | Vite Vue `.g.vue`, template branches, provide/inject |
| [next-app-router-setup.it.md](../intelligence-tests/next-app-router-setup.it.md) | Next.js App Router layout isolation |
| [cli-serve-lifecycle.it.md](../intelligence-tests/cli-serve-lifecycle.it.md) | `runelight serve` / `capture` process lifecycle |

### When to run

- After changing setup profiles, adapters, CLI serve/capture, or Studio manifest behavior
- Before release when integration contracts may have shifted
- When validating agent skill changes end-to-end

### How to run

Use the [`intelligence-test`](../.agents/skills/intelligence-test/SKILL.md) skill, or ask an agent to execute a specific `.it.md` file. The agent should:

1. Pick or create a temporary project
2. Follow the task card outcomes
3. Clean up servers, temp projects, and artifacts

Do not assume an already-integrated monorepo example proves fresh setup behavior.

### Writing new tests

See [`write-intelligence-test`](../.agents/skills/write-intelligence-test/SKILL.md).

## Examples

`examples/react-vite` and `examples/vue-vite` are reference integrations — useful for manual smoke tests, not substitutes for intelligence-test setup flows.

## Engineering traces

Performance and architecture notes for Studio live under [`traces/`](../traces/). See [Studio canvas optimization trace](../traces/2026-05-28-studio-canvas-performance-optimization.md) for canvas/preview pipeline context.
