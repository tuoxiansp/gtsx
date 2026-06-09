# Vite Vue

Use this profile for Vite Vue 3 TypeScript apps when the original browser entry can be preserved.

## Packages

Install:

- `@runelight/core`
- `@runelight/studio`
- `@runelight/adapter-vite-vue`

Do not install `@runelight/preview-vue` directly.

## Configuration

- Configure `runelightViteVue` from `@runelight/adapter-vite-vue`.
- Use `runelightViteVue()` without statically importing the Runelight config from `vite.config.*`; the adapter loads the Runelight config lazily, so production builds do not require `runelight.config.ts`.
- The adapter serves the prebuilt Studio app at `/runelight/studio` and `/runelight/studio/assets/*`.
- Configure `host.command` as the direct framework dev command that `runelight serve` wraps, with `{port}` as the port placeholder. Do not point `host.command` at a package script that itself runs `runelight serve`.
- `.g.vue` files are ordinary Vue SFCs with one `<g:frames>` block.
- Vue frames use `props` and `scope`; do not generate or document `bindings`.
- Vue native `provide`/`inject` preview works through static frame `provide` entries when the injected key is importable from `<g:frames>`.
- Declared Vue injection variants need `defineGInjectionKey` and `GVueProvideFrame` markers.
- Record the local Runelight entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`. `src/app/runelight` is the default when the project keeps all authored source under `src`; `app/runelight` at the project root is also valid.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames; the first `design-runelight-vue` request writes the first `.g.vue` frame.
- Preserve the existing application render path. Only `/runelight` renders the preview app.

`vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue"
import { runelightViteVue } from "@runelight/adapter-vite-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [runelightViteVue(), vue()],
})
```

`runelight.config.ts`:

```ts
import { defineRunelightConfig } from "@runelight/core/define-config"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
    namespace: "my-project",
  },
  host: {
    command: "npx vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
```

Use the detected package manager's exec form in `host.command`: `npx vite ...` for npm, `pnpm exec vite ...` for pnpm. `runelight serve` substitutes `{port}` with the Runelight-owned port, sets `RUNELIGHT_DEV=1`, and prints the serve and Studio URLs. Routes are fixed at `/runelight`, `/runelight/studio`, and `/runelight/studio/manifest`; they are not configurable.

In Vue projects, import `defineRunelightConfig` from `@runelight/core/define-config` (and config types from `@runelight/core/config-types`), not from the `@runelight/core` root. The root export pulls in the React-dependent runtime, which is not installed in a Vue host; the subpath exports keep config loading dependency-free.

## Browser Entry

The preview branch should import the same app-wide CSS and static visual environment as the normal app, without running production-only routers, auth/session clients, stores, or data fetchers.

`src/main.ts`:

```ts
import { createApp } from "vue"

import App from "./App.vue"
import "./style.css"

void renderApp()

async function renderApp() {
  if (import.meta.env.DEV && window.location.pathname === "/runelight") {
    const { createRunelightVuePreviewApp } = await import("./preview")
    createApp(createRunelightVuePreviewApp()).mount("#app")
    return
  }

  createApp(App).mount("#app")
}
```

`src/preview.ts`:

```ts
import { defineComponent, h } from "vue"
import {
  createRunelightViteVuePreviewComponentLoader,
  readRunelightVuePreviewRouteParams,
  RunelightViteVuePreviewClient,
  type RunelightVuePreviewModule,
} from "@runelight/adapter-vite-vue/preview"
import runelightConfig from "virtual:runelight/config"

const modules = import.meta.glob<RunelightVuePreviewModule>(
  ["./**/*.g.vue", "./app/runelight/design/**/*.g.vue"],
  { query: "?runelight-vue-preview" },
)
const loadPreviewComponent = createRunelightViteVuePreviewComponentLoader(modules, {
  sourceRoot: runelightConfig.project.sourceRoot,
})

export function createRunelightVuePreviewApp() {
  return defineComponent({
    name: "RunelightVuePreviewApp",
    setup() {
      const params = readRunelightVuePreviewRouteParams(new URLSearchParams(window.location.search))
      return () => h(RunelightViteVuePreviewClient, { ...params, loadComponent: loadPreviewComponent })
    },
  })
}
```

If setup selected `project.entryRoot: "app/runelight"` instead of `src/app/runelight`, write the design glob as `"/app/runelight/design/**/*.g.vue"`. Do not include multiple candidate design globs.

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "virtual:runelight/config" {
  import type { ResolvedRunelightConfig } from "@runelight/core/config-types"

  const config: ResolvedRunelightConfig
  export default config
}
```

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start the dev server through `runelight serve` (or the package script that wraps it). Runelight routes only activate when the Host runs with `RUNELIGHT_DEV=1`, which `runelight serve` sets.
4. Open `/` and confirm the original app still renders.
5. Open `/runelight/studio`.
6. If a `.g.vue` entry exists, open one `/runelight?...` preview URL and verify frame `scope` or `provide` values override production setup state.
