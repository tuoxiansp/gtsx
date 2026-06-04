# Vite React

Use this profile for Vite React TypeScript apps and Vite-compatible client-only React SPAs, including React Router or TanStack Router SPA projects, when the original browser entry can be preserved.

## Packages

Install:

- `@gtsx/core`
- `@gtsx/studio`
- `@gtsx/adapter-vite-react`

Do not install `@gtsx/preview-react` directly.

## Configuration

- Configure `gtsxViteReact` from `@gtsx/adapter-vite-react`.
- Use `gtsxViteReact()` without statically importing `gtsx.config.ts` from `vite.config.*`; the adapter keeps the `.g.tsx` component transform active for both dev and build, and loads `gtsx.config.ts` only when dev-only virtual GTSX modules are loaded.
- `.g.tsx` files are production React components. Do not move normal app imports away from `.g.tsx`; isolate only Studio, preview routes, `virtual:gtsx/*`, and generated preview registries from production bundles.
- Production `vite build` must not require `gtsx.config.ts`, resolve `virtual:gtsx/*`, include Studio/preview route code, expose a usable `/gtsx` experience, or read/write GTSX-generated preview files.
- If the root `tsconfig.json` is a references container, set `project.tsconfig` to the app config that includes React files, usually `tsconfig.app.json`.
- Record the local GTSX entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`; do not add a `designRoot` config key.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames; the first `design-gtsx` request writes the first `.g.tsx` frame.
- In upgrade/ensure mode, do not rewrite `vite.config.*`, `gtsx.config.ts`, browser-entry branches, or `src/preview.tsx` if they already exist and pass verification; only update packages and add missing design-directory support.
- After package upgrades, rerun Vite typecheck/dev verification. If adapter exports, virtual modules, preview loader signatures, or manifest generation changed, migrate only the affected glue while preserving the existing app render path.
- Preserve the existing application render path. Only `/gtsx` renders the preview app and only `/gtsx/studio` renders Studio.

`vite.config.ts`:

```ts
import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [gtsxViteReact(), react()],
})
```

`gtsx.config.ts`:

```ts
import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/gtsx",
    namespace: "my-project",
  },
  routes: {
    preview: "/gtsx",
    studio: "/gtsx/studio",
    manifest: "/gtsx/studio/manifest",
  },
  preview: {
    serve: "npm run dev -- --host 127.0.0.1 --port {port}",
    studioUrl: "http://127.0.0.1:{port}/gtsx/studio",
    url: "http://127.0.0.1:{port}/gtsx?entry={entry}&frame={frame}{gframe}",
    allUrl: "http://127.0.0.1:{port}/gtsx?entry={entry}{gframe}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

If the project uses npm, `serve` needs `npm run dev -- --host ...`. For pnpm, prefer `pnpm dev --host ...`. Keep the selected host consistent with the URLs.

## Browser Entry

Before branching to `/gtsx`, identify the visual environment used by the components being previewed:

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
  if (import.meta.env.DEV && window.location.pathname === "/gtsx/studio") {
    const [{ StudioShell, createStudioManifestFromGTSXConfig }, { default: gtsxConfig }, { default: projectIndex }] =
      await Promise.all([
        import("@gtsx/studio"),
        import("virtual:gtsx/config"),
        import("virtual:gtsx/project-index"),
      ])

    root.render(<StudioShell manifest={createStudioManifestFromGTSXConfig(projectIndex, gtsxConfig)} />)
    return
  }

  if (import.meta.env.DEV && window.location.pathname === "/gtsx") {
    const { GTSXPreviewApp } = await import("./preview")
    root.render(<GTSXPreviewApp />)
    return
  }

  root.render(<App />)
}
```

`src/preview.tsx`:

```tsx
import {
  createGTSXVitePreviewComponentLoader,
  GTSXVitePreviewClient,
  readGTSXPreviewRouteParams,
  type GTSXPreviewModule,
} from "@gtsx/adapter-vite-react/preview"
import gtsxConfig from "virtual:gtsx/config"

const modules = import.meta.glob<GTSXPreviewModule>(["./**/*.g.tsx", "/app/gtsx/design/**/*.g.tsx"])
const loadPreviewComponent = createGTSXVitePreviewComponentLoader(modules, {
  sourceRoot: gtsxConfig.project.sourceRoot,
})

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return <GTSXVitePreviewClient {...params} loadComponent={loadPreviewComponent} />
}
```

If setup selected `project.entryRoot: "src/app/gtsx"`, write the static glob as `"/src/app/gtsx/design/**/*.g.tsx"` instead. Do not include multiple candidate design globs.

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "virtual:gtsx/project-index" {
  import type { GTSXProjectIndex } from "@gtsx/core/project-index"

  const projectIndex: GTSXProjectIndex
  export default projectIndex
}

declare module "virtual:gtsx/config" {
  import type { ResolvedGTSXConfig } from "@gtsx/core"

  const config: ResolvedGTSXConfig
  export default config
}
```

## Verify

1. Run typecheck/build.
2. Run `gtsx check`.
3. Start the Vite dev server.
4. Open `/` and confirm the original app still renders.
5. Open `/gtsx/studio`.
6. If a `.g.tsx` entry exists, open one `/gtsx?...` preview URL and run capture.
