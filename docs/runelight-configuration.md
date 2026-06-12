# Runelight Configuration

`runelight.config.ts` is the single source of truth for project scope, framework contracts, and the Host command. The CLI and the framework adapters both read it (`runelight.config.js` and `runelight.config.cjs` are also accepted).

```ts
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    namespace: "my-project",
  },
  host: {
    command: "npx vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
```

`@runelight/core` is framework-neutral. Import React authoring helpers from `@runelight/react/runtime` and Vue authoring helpers from `@runelight/vue/runtime`; keep project configuration on `@runelight/core`.

## `contracts`

| Value | Meaning |
| --- | --- |
| `"@runelight/react/contract"` | Enables React `.g.tsx` static analysis, transform metadata, and manifest indexing. |
| `"@runelight/vue/contract"` | Enables Vue `.g.vue` static analysis, preview transform metadata, and manifest indexing. |

`contracts` are resolved from the project root, so the corresponding framework package must be installed in the app. Use string specifiers in `runelight.config.ts`; programmatic callers may pass contract objects directly to low-level APIs such as `buildRunelightProjectIndex`.

## `project`

| Key | Default | Meaning |
| --- | --- | --- |
| `sourceRoot` | — (required) | Root that scopes configured `.g` entry discovery for analysis, Studio, and preview. Use `"."` for root-level `app`, `pages`, `components`, or `lib`; use `"src"` when app source lives under `src`. |
| `entryRoot` | — (required) | Filesystem directory that owns the local `/runelight` entry. Design frames live in `${entryRoot}/design`. Typically `app/runelight`, or `src/app/runelight` when source lives under `src`. |
| `namespace` | — | Optional stable cache namespace. Runelight does not derive a default from the project directory name. Use the package name or repo slug when you want Studio browser caches to survive path or manifest-shape changes; omit it when no stable project identity is available. |
| `tsconfig` | nearest `tsconfig.json` | Optional TypeScript project override used for discovery and analysis. It replaces the nearest-tsconfig fallback rather than merging with it. Point it at the app config (such as `tsconfig.app.json`) when the root config is a references container. CLI `-p` overrides this field. |

## `host`

| Key | Default | Meaning |
| --- | --- | --- |
| `command` | — | The direct framework dev command that `runelight serve` wraps, with `{port}` as the port placeholder, for example `pnpm exec vite --host 127.0.0.1 --port {port} --strictPort`. Required by `runelight serve` and by `runelight capture` when no serve session is running. Do not point it at a package script that itself runs `runelight serve`. |

`runelight serve` substitutes `{port}`, sets `RUNELIGHT_DEV=1` in the Host environment, and prints the serve and Studio URLs.

## Routes

Routes are fixed and not configurable:

| Route | Serves |
| --- | --- |
| `/runelight` | Preview client (`entry`, `frame`, `frameOverride` search params) |
| `/runelight/studio` | Prebuilt Studio app (`/runelight/studio/assets/*` for assets) |
| `/runelight/studio/manifest` | Project manifest JSON |

## Production Behavior

Runelight is development-only in normal app builds: production routes should not expose a usable `/runelight*` experience, and Runelight frames should remain inert outside Studio and preview.
