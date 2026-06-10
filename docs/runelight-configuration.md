# Runelight Configuration

`runelight.config.ts` is the single source of truth for project scope and the Host command. The CLI and the framework adapters both read it (`runelight.config.js` and `runelight.config.cjs` are also accepted).

```ts
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
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

In Vue projects, import from `@runelight/core/define-config` instead of the `@runelight/core` root: the root export pulls in the React-dependent runtime, which is not installed in a Vue host. The subpath works everywhere; React projects may use either.

## `project`

| Key | Default | Meaning |
| --- | --- | --- |
| `sourceRoot` | `"src"` | Root that scopes `.g.tsx` / `.g.vue` discovery and preview entry paths. Use `"."` for root-level `app`, `pages`, `components`, or `lib`. |
| `entryRoot` | — (required by design features) | Filesystem directory that owns the local `/runelight` entry. Design frames live in `${entryRoot}/design`. Typically `app/runelight`, or `src/app/runelight` when source lives under `src`. |
| `namespace` | — | Stable cache namespace. Use the package name or repo slug, not a file hash. |
| `tsconfig` | nearest `tsconfig.json` | The TypeScript project used for discovery and analysis. Point it at the app config (such as `tsconfig.app.json`) when the root config is a references container. |

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

By default, Runelight is development-only: production builds should not require `runelight.config.ts`, should not bundle preview route code, and should not expose usable `/runelight*` routes. Frames in `.g` files are inert static data either way.
