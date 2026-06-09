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

## Documentation

| Audience | Location |
|----------|----------|
| Humans | `docs/` — protocol, guides, CLI, config |
| Agents | `skills/` — executable workflows; install via README prompt |
| Maintainers | `intelligence-tests/`, `traces/`, `.agents/skills/` |

When changing integration contracts, update **both** human docs (`docs/`) and agent skills (`skills/setup-runelight/profiles/`). Keep `runelight.config.ts` examples aligned with `packages/core/src/config-types.ts`.

Agent skills are installed into user projects by copying directories — not via `npx skills add`. That is intentional so setup remains an agent workflow.

## Pull requests

1. Branch from `main`
2. Keep changes focused; match existing code style
3. Run `pnpm test` and `pnpm typecheck`
4. Update docs/skills when behavior or config shape changes
5. For integration changes, note which intelligence tests should be re-run

## Intelligence tests

See [docs/testing.md](docs/testing.md). Agent-driven `.it.md` files validate setup and lifecycle behavior that unit tests do not cover.

## Skills maintenance

See [`skills/write-runelight-skill/SKILL.md`](skills/write-runelight-skill/SKILL.md) for skill structure conventions.
