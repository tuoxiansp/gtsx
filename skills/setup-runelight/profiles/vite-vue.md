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
- Use `runelightViteVue()` in `vite.config.*`.
- The adapter serves the prebuilt Studio app at `/runelight/studio` and `/runelight/studio/assets/*`.
- `.g.vue` files are ordinary Vue SFCs with one `<g:frames>` block.
- Vue frames use `props` and `scope`; do not generate or document `bindings`.
- Vue native `provide`/`inject` preview works through static frame `provide` entries when the injected key is importable from `<g:frames>`.
- Declared Vue injection variants need `defineGInjectionKey` and `GVueProvideFrame` markers.
- Record the local Runelight entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`.
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
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
    namespace: "my-project",
  },
  host: {
    command: "npm run dev -- --host 127.0.0.1 --port {port}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

`runelight serve` substitutes `{port}` in `host.command`. Routes are Runelight defaults — do not add a `routes` key.

Use the detected package manager in `host.command`: npm needs `npm run dev -- --host ...`; pnpm can use `pnpm dev --host 127.0.0.1 --port {port}`.

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

## Production opt-in (optional)

Set `studio.exposeInProduction: true` in `runelight.config.ts` when the Vite production build should emit usable `/runelight` and Studio routes. Default is off.

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start the Vite dev server.
4. Open `/` and confirm the original app still renders.
5. Open `/runelight/studio`.
6. If a `.g.vue` entry exists, open one `/runelight?...` preview URL and verify frame `scope` or `provide` values override production setup state.
