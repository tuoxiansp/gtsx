# Contributing to Runelight

## Prerequisites

- Node.js and [pnpm](https://pnpm.io/)
- Linux or macOS recommended for full test suites (some CLI tests exercise process groups)

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Monorepo packages:

| Package | Role |
|---------|------|
| `@runelight/core` | Protocol, analyzer, config, CLI |
| `@runelight/cli` | `runelight` bin |
| `@runelight/studio` | Prebuilt Studio app |
| `@runelight/adapter-vite-react` | Vite + React |
| `@runelight/adapter-vite-vue` | Vite + Vue |
| `@runelight/adapter-next-react` | Next.js App Router |

Examples: `examples/react-vite`, `examples/vue-vite`.

## Documentation vs agent interface

| Layer | Location | Role |
|-------|----------|------|
| Human docs | `docs/` | Protocol, guides, CLI, config, troubleshooting |
| Agent interface | `skills/` | Product API for agents — each `SKILL.md` is a capability contract |
| Repo maintainer agents | `.agents/skills/` | Intelligence-test authoring and E2E validation |
| E2E specs | `intelligence-tests/` | Agent-driven acceptance criteria |

**Do not treat `skills/` as documentation.** Adding or changing a skill is an interface change (like adding a public API), not a doc edit. Human prose belongs in `docs/`; execution contracts belong in `skills/`.

When changing integration contracts, update human docs (`docs/`) and the affected skills (`skills/setup-runelight/profiles/`, etc.). Keep `runelight.config.ts` examples aligned with `packages/core/src/config-types.ts`.

Skills are installed into user projects by agent copy (see README) — not via `npx skills add`. That keeps setup inside the agent workflow.

### Agent skills (interface catalog)

| Skill | Capability |
|-------|------------|
| `setup-runelight` | Install, upgrade, repair Host integration |
| `authoring-runelight-react` / `-vue` | Write `.g.tsx` / `.g.vue` components |
| `refactor-to-runelight-react` / `-vue` | Migrate existing components |
| `design-runelight-react` / `-vue` | Studio design workspace frames |

## Pull requests

1. Branch from `main`
2. Keep changes focused; match existing code style
3. Run `pnpm test` and `pnpm typecheck`
4. Update docs/skills when behavior or config shape changes
5. For integration changes, note which intelligence tests should be re-run

## Intelligence tests

See [docs/testing.md](docs/testing.md). Agent-driven `.it.md` files validate setup and lifecycle behavior that unit tests do not cover.

New skills require the same care as new public APIs: clear `description` triggers, accurate config examples, and intelligence-test coverage when setup behavior changes.
