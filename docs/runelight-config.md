# Runelight Configuration

`runelight.config.ts` is the project-level contract for `runelight serve`, `runelight check`, `runelight capture`, and Studio scope.

`defineRunelightConfig` is exported from `@runelight/core` (and `@runelight/core/define-config` — equivalent).

## Schema

```ts
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",           // required after resolve; default "src"
    entryRoot: "app/runelight",  // required for design frames + manifest scope
    namespace: "my-project",     // manifest cache namespace
    tsconfig: "tsconfig.app.json", // optional; use when root tsconfig is a references container
  },
  host: {
    command: "pnpm dev --host 127.0.0.1 --port {port}", // required for runelight serve / capture
  },
  studio: {
    manifestCacheTtlMs: 1000,    // optional; default 1000
    exposeInProduction: false,   // optional; default false
  },
})
```

## Fields

| Field | Purpose |
|-------|---------|
| `project.sourceRoot` | Directory scanned for `.g.tsx` / `.g.vue` protocol files |
| `project.entryRoot` | Filesystem directory for local `/runelight` integration; design frames live in `${entryRoot}/design/` |
| `project.namespace` | Stable Studio manifest namespace (package name or repo slug, not a hash) |
| `project.tsconfig` | App tsconfig when the root config is a project-references container |
| `host.command` | Host dev command; `{port}` is substituted by `runelight serve` |
| `studio.manifestCacheTtlMs` | Studio manifest HTTP cache TTL in development |
| `studio.exposeInProduction` | When `true`, adapters may emit production `/runelight` and Studio routes (opt-in; default off) |

## Defaults (not configurable)

Routes are fixed conventions:

| Route | Path |
|-------|------|
| Preview | `/runelight` |
| Studio | `/runelight/studio` |
| Manifest | `/runelight/studio/manifest` |

Do not add a `routes` or `preview` block to `runelight.config.ts` — those shapes are obsolete.

## `host.command` examples

| Package manager | Example |
|-----------------|---------|
| pnpm + Vite | `pnpm dev --host 127.0.0.1 --port {port}` |
| npm + Vite | `npm run dev -- --host 127.0.0.1 --port {port}` |
| pnpm + Next.js | `pnpm dev --hostname 127.0.0.1 --port {port}` |
| npm + Next.js | `npm run dev -- --hostname 127.0.0.1 --port {port}` |

## Production behavior

By default, Runelight preview and Studio routes are development-only. Production builds do not require `runelight.config.ts` for normal app code.

Set `studio.exposeInProduction: true` only when you intentionally want production `/runelight` and Studio surfaces (for example internal design review on a staging build). See [Troubleshooting](./troubleshooting.md) and adapter profiles in [`skills/setup-runelight`](../skills/setup-runelight/SKILL.md).

## Related

- [CLI](./cli.md) — `serve`, `check`, `capture`
- [Setup skill](../skills/setup-runelight/SKILL.md) — profile-specific wiring
- [Design workspace](./runelight-design-workspace.md) — `${project.entryRoot}/design/`
