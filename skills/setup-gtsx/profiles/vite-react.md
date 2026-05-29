# Vite React

Use this profile for Vite React TypeScript apps and Vite-compatible client-only React SPAs, including React Router or TanStack Router SPA projects, when the original browser entry can be preserved.

## Packages

Install:

- `gtsx`
- `@gtsx/studio`
- `@gtsx/adapter-vite-react`

Do not install `@gtsx/preview-react` directly.

## Configuration

- Configure `gtsxViteReact` from `@gtsx/adapter-vite-react`.
- Pass the project `gtsx.config.ts` to `gtsxViteReact({ config: gtsxConfig })`.
- If the root `tsconfig.json` is a references container, set `project.tsconfig` to the app config that includes React files, usually `tsconfig.app.json`.
- Preserve the existing application render path. Only `/gtsx` renders the preview app and only `/gtsx/studio` renders Studio.

`vite.config.ts`:

```ts
import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import gtsxConfig from "./gtsx.config"

export default defineConfig({
  plugins: [gtsxViteReact({ config: gtsxConfig }), react()],
})
```

`gtsx.config.ts`:

```ts
import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  project: {
    root: "src",
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
    url: "http://127.0.0.1:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://127.0.0.1:{port}/gtsx?entry={entry}{gcase}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

If the project uses npm, `serve` needs `npm run dev -- --host ...`. For pnpm, prefer `pnpm dev --host ...`. Keep the selected host consistent with the URLs.

## Browser Entry

`src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client"
import { StudioShell, createStudioManifestFromGTSXConfig } from "@gtsx/studio"
import gtsxConfig from "virtual:gtsx/config"
import projectIndex from "virtual:gtsx/project-index"

import App from "./App"
import { GTSXPreviewApp } from "./preview"

const studioManifest = createStudioManifestFromGTSXConfig(projectIndex, gtsxConfig)
const app =
  window.location.pathname === "/gtsx/studio" ? (
    <StudioShell manifest={studioManifest} />
  ) : window.location.pathname === "/gtsx" ? (
    <GTSXPreviewApp />
  ) : (
    <App />
  )

createRoot(document.getElementById("root")!).render(app)
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

const modules = import.meta.glob<GTSXPreviewModule>("./**/*.g.tsx")
const loadPreviewComponent = createGTSXVitePreviewComponentLoader(modules, {
  projectRoot: gtsxConfig.project.root,
})

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return <GTSXVitePreviewClient {...params} loadComponent={loadPreviewComponent} />
}
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "virtual:gtsx/project-index" {
  import type { GTSXProjectIndex } from "gtsx/project-index"

  const projectIndex: GTSXProjectIndex
  export default projectIndex
}

declare module "virtual:gtsx/config" {
  import type { ResolvedGTSXConfig } from "gtsx"

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
