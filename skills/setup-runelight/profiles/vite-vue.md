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
- Vue provider frames through `provide`/`inject` are not supported yet.
- Record the local Runelight entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames.
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
  routes: {
    preview: "/runelight",
    studio: "/runelight/studio",
    manifest: "/runelight/studio/manifest",
  },
  preview: {
    serve: "npm run dev -- --host 127.0.0.1 --port {port}",
    studioUrl: "http://127.0.0.1:{port}/runelight/studio",
    url: "http://127.0.0.1:{port}/runelight?entry={entry}&frame={frame}{frameOverrides}",
    allUrl: "http://127.0.0.1:{port}/runelight?entry={entry}{frameOverrides}",
  },
})
```

Use the detected package manager in `preview.serve`: npm needs `npm run dev -- --host ...`; pnpm can use `pnpm dev --host ...`. Keep URL hostnames consistent with the dev command.

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

## Project-Level Authoring Skill

Install or preserve `.agents/skills/authoring-runelight-vue` in the target project. Do not rely on a global authoring skill for Vue authoring.

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start the Vite dev server.
4. Open `/` and confirm the original app still renders.
5. Open `/runelight/studio`.
6. If a `.g.vue` entry exists, open one `/runelight?...` preview URL and verify frame `scope` overrides production setup state.
