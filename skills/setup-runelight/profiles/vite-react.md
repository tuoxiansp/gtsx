# Vite React

Use this profile for Vite React TypeScript apps and Vite-compatible client-only React SPAs, including React Router or TanStack Router SPA projects, when the original browser entry can be preserved.

## Packages

Install:

- `@runelight/core`
- `@runelight/react`
- `@runelight/adapter-vite-react`

The adapter uses the `@runelight/react/preview` adapter runtime API internally; user projects should not install legacy preview packages or import it outside adapter glue.

## Configuration

- Configure `runelightViteReact` from `@runelight/adapter-vite-react`.
- Use `runelightViteReact()` without statically importing the Runelight config from `vite.config.*`; the adapter keeps the `.g.tsx` component transform active for both dev and build, and loads the Runelight config only when dev-only virtual Runelight modules are loaded.
- `.g.tsx` files are production React components. Do not move normal app imports away from `.g.tsx`; isolate only preview routes, `virtual:runelight/preview-config`, and adapter-generated Runelight files from production bundles.
- The Vite adapter serves the `/runelight/session` endpoint; the browser entry should branch only on `/runelight` for preview.
- Production app behavior must remain unchanged: normal `vite build` must not require the Runelight config, resolve `virtual:runelight/preview-config`, include preview route code, expose a usable `/runelight` experience, or read/write Runelight-generated preview files.
- If the root `tsconfig.json` is a references container, set `project.tsconfig` to the app config that includes React files, usually `tsconfig.app.json`.
- Configure `host.command` as the direct framework dev command that `runelight serve` wraps, with `{port}` as the port placeholder. Do not point `host.command` at a package script that itself runs `runelight serve`.
- Record the local Runelight entry directory in `project.entryRoot`. Generated Runelight files live in `${project.entryRoot}/.runelight/`; ensure `.gitignore` contains `.runelight/`, which covers this generated folder at any depth. Use `src/app/runelight` when the project keeps authored source under `src`, or `app/runelight` for root-level source projects.
- During setup, create only the integration glue needed for preview/session; do not create sample `.g.tsx` components or placeholder frames.
- In upgrade/ensure mode, do not rewrite `vite.config.*`, Runelight config, browser-entry branches, or `src/preview.tsx` if they already exist and pass verification; only update packages and migrate glue proven incompatible by the upgrade audit.
- After package upgrades, rerun Vite typecheck/dev verification. If adapter exports, virtual modules, preview loader signatures, or adapter-generated file wiring changed, migrate only the affected glue while preserving the existing app render path.
- Preserve the existing application render path. Only `/runelight` renders the preview app.

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
  contracts: ["@runelight/react/contract"],
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

Use the detected package manager's exec form in `host.command`: `npx vite ...` for npm, `pnpm exec vite ...` for pnpm. `runelight serve` substitutes `{port}` with the Runelight-owned port, sets `RUNELIGHT_DEV=1`, waits for `/runelight/session`, and prints the serve URL plus the base `/runelight` preview URL. User-facing routes are fixed and not configurable: `/runelight` and `/runelight/session`.

Recommended `package.json` scripts:

```json
{
  "scripts": {
    "dev": "runelight serve",
    "runelight:check": "runelight check"
  }
}
```

Do not add a default `runelight:capture` script during setup. Capture has side effects and writes image files, so run it explicitly against a concrete entry or directory when needed.

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
  if (__RUNELIGHT_DEV__ && window.location.pathname === "/runelight") {
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
  readRunelightReactPreviewRouteParams,
  type RunelightReactPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import previewConfig from "virtual:runelight/preview-config"

const modules = import.meta.glob<RunelightReactPreviewModule>("/src/**/*.g.tsx", {
  query: "?runelight-preview",
})
const loadPreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: previewConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightReactPreviewRouteParams(new URLSearchParams(window.location.search))

  return <RunelightVitePreviewClient {...params} loadComponent={loadPreviewComponent} />
}
```

The `?runelight-preview` glob query lets the adapter apply the preview-specific transform to preview-loaded modules. Generate this glob string from the selected `project.sourceRoot`. For example, `project.sourceRoot: "src"` becomes `"/src/**/*.g.tsx"`.

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "virtual:runelight/preview-config" {
  const config: {
    project: {
      sourceRoot: string
    }
  }
  export default config
}

declare const __RUNELIGHT_DEV__: boolean
```

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start the dev server through `runelight serve` (or the package script that wraps it). Runelight routes only activate when the Host runs with `RUNELIGHT_DEV=1`, which `runelight serve` sets and the adapter exposes to the browser entry as `__RUNELIGHT_DEV__`.
4. Open `/` and confirm the original app still renders.
5. Open `/runelight/session` and confirm it returns JSON.
6. If a `.g.tsx` entry exists, use `runelight preview-targets <entry[#export]> --json`, open one `/runelight?...` preview URL, and run capture.
