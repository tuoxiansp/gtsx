# Vite React

Use this profile for Vite React TypeScript apps and Vite-compatible client-only React SPAs, including React Router or TanStack Router SPA projects, when the original browser entry can be preserved.

## Packages

Install:

- `@runelight/core`
- `@runelight/studio`
- `@runelight/adapter-vite-react`

Do not install `@runelight/preview-react` directly.

## Configuration

- Configure `runelightViteReact` from `@runelight/adapter-vite-react`.
- Use `runelightViteReact()` without statically importing the Runelight config from `vite.config.*`; the adapter keeps the `.g.tsx` component transform active for both dev and build, and loads the Runelight config only when dev-only virtual Runelight modules are loaded.
- `.g.tsx` files are production React components. Do not move normal app imports away from `.g.tsx`; isolate only preview routes, `virtual:runelight/*`, and generated preview registries from production bundles.
- The Vite adapter serves the prebuilt Studio app at `/runelight/studio` and `/runelight/studio/assets/*`; the browser entry should not import `@runelight/studio`.
- Production `vite build` must not require the Runelight config, resolve `virtual:runelight/*`, include preview route code, expose a usable `/runelight` experience, or read/write Runelight-generated preview files.
- If the root `tsconfig.json` is a references container, set `project.tsconfig` to the app config that includes React files, usually `tsconfig.app.json`.
- Record the local Runelight entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`; do not add a `designRoot` config key.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames; the first `design-runelight-react` request writes the first `.g.tsx` frame.
- In upgrade/ensure mode, do not rewrite `vite.config.*`, Runelight config, browser-entry branches, or `src/preview.tsx` if they already exist and pass verification; only update packages and add missing design-directory support.
- After package upgrades, rerun Vite typecheck/dev verification. If adapter exports, virtual modules, preview loader signatures, or manifest generation changed, migrate only the affected glue while preserving the existing app render path.
- Preserve the existing application render path. Only `/runelight` renders the preview app. `/runelight/studio` is handled by the adapter middleware and should not be a browser-entry branch.

`vite.config.ts`:

```ts
import { runelightViteReact } from "@runelight/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [runelightViteReact(), react()],
})
```

`runelight.config.ts`:

```ts
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
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

`runelight serve` substitutes `{port}` in `host.command`. Routes (`/runelight`, `/runelight/studio`, `/runelight/studio/manifest`) are Runelight defaults — do not add a `routes` key.

Use the detected package manager in `host.command`: npm needs `npm run dev -- --host ...`; pnpm can use `pnpm dev --host 127.0.0.1 --port {port}`. Keep the host binding consistent with verification URLs on `127.0.0.1`.

## Browser Entry

Before branching to `/runelight`, identify the visual environment used by the components being previewed:

- App-wide CSS imports.
- Design-system or registry CSS imports.
- Static root classes or `data-*` attributes that select a theme, base color, density, or style preset.
- Font/style setup imports that affect component measurements.

The preview branch must load those visual pieces too. Keep the preview shell static: imports, classes, attributes, and CSS variables are fine; production providers that run ordinary React hooks, auth/session clients, routers, fetchers, or effects do not belong in the preview entry.

`src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client"

import App from "./App"
import "./index.css"

const root = createRoot(document.getElementById("root")!)

void renderApp()

async function renderApp() {
  if (import.meta.env.DEV && window.location.pathname === "/runelight") {
    const { RunelightPreviewApp } = await import("./preview")
    root.render(<RunelightPreviewApp />)
    return
  }

  root.render(<App />)
}
```

`src/preview.tsx`:

```tsx
import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightPreviewRouteParams,
  type RunelightPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import runelightConfig from "virtual:runelight/config"

const modules = import.meta.glob<RunelightPreviewModule>(["./**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"])
const loadPreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: runelightConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightPreviewRouteParams(new URLSearchParams(window.location.search))

  return <RunelightVitePreviewClient {...params} loadComponent={loadPreviewComponent} />
}
```

If setup selected `project.entryRoot: "src/app/runelight"`, write the static glob as `"/src/app/runelight/design/**/*.g.tsx"` instead. Do not include multiple candidate design globs.

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "virtual:runelight/config" {
  import type { ResolvedRunelightConfig } from "@runelight/core"

  const config: ResolvedRunelightConfig
  export default config
}
```

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start the Vite dev server.
4. Open `/` and confirm the original app still renders.
5. Open `/runelight/studio`.
6. If a `.g.tsx` entry exists, open one `/runelight?...` preview URL and run capture.
