---
name: setup-gtsx
description: Install gtsx Studio into a React project. Detects the TypeScript project and Host (Next.js or Vite), installs packages, wires routes, and verifies the integration end-to-end. Use when a project asks for "install gtsx" or "set up gtsx".
---

# Install gtsx In This Project

Install the smallest working gtsx integration. Stop and ask if the TypeScript project or Host choice is ambiguous. Do not migrate components unless the user explicitly asked.

## Model

- gtsx Project = selected TypeScript project + `.g.tsx` protocol.
- gtsx Scope = `.g.tsx` files in the selected TypeScript Program.
- Host = framework/runtime that renders that scope.
- Adapter = package that makes the Host understand gtsx transforms and preview URLs.
- Scope follows TypeScript. Host does not expand scope.

## Steps

1. Detect package manager and workspace layout.
2. Resolve the TypeScript project:
   - Prefer explicit `-p` / `--project` user input.
   - Otherwise: nearest `tsconfig.json`.
   - Ambiguous → stop and ask.
3. Detect the Host:
   - Next.js React → `@gtsx/adapter-next-react`
   - Vite React → `@gtsx/adapter-vite-react`
   - Ambiguous → stop and ask.
4. Install packages:
   - Always: `gtsx`, `@gtsx/studio`
   - Next React: `@gtsx/adapter-next-react`
   - Vite React: `@gtsx/adapter-vite-react`
   - Never add `@gtsx/preview-react` directly — it is adapter internals.
5. Add scripts:
   - `gtsx:check`: `gtsx check <scope>`
   - `gtsx:serve`: `gtsx serve` (optional)
6. Add Host-local routes:
   - `/gtsx` — preview route
   - `/gtsx/studio` — Studio shell
   - `/gtsx/studio/manifest` — manifest endpoint (if Host supports API routes)

## Studio Integration

- Use `StudioShell` from `@gtsx/studio/client` in Next.js route files.
- Use `createStudioManifestProvider` from `@gtsx/studio/manifest-server` in server-side Hosts.
- Use `createStudioManifestFromGTSXConfig` from `@gtsx/studio` in Vite browser entries.
- Manifest entries come only from `.g.tsx` files in the selected TypeScript Program.
- Put the selected root, optional tsconfig, stable cache namespace, routes, and preview commands in `gtsx.config.ts`. Route files should consume the config through helpers instead of repeating it.
- Use the package name or repo slug as `project.namespace`, not a file hash. Component source hashes are already part of the preview cache keys.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## Preview Integration

- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, adapter loading.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, case override merging, or scope fallback logic.
- Import preview clients from framework adapters, not from `@gtsx/preview-react`.
- Use adapter helpers for route search params and preview component loading. Do not hand-roll `gcase`, `case`, `static`, entry parsing, or `import.meta.glob` key normalization.
- For SSR preview routes, install only adapter-provided preview SSR scripts. Do not write app-local preview bootstrap or `postMessage` bridge code.

## Next.js React

- Wrap config with `gtsxNextReact` from `@gtsx/adapter-next-react`.
- Pass the project `gtsx.config.ts` to `gtsxNextReact({ config: gtsxConfig })`.
- The adapter generates `.gtsx/preview-entries.ts` and wires webpack/Turbopack automatically.
- Client wrapper:

```tsx
"use client"
export { GTSXNextPreviewClient as GTSXPreviewClient } from "@gtsx/adapter-next-react/preview"
```

- `/gtsx` page: use `readGTSXNextPreviewProps` and `createGTSXNextPreviewSsrScripts` from `@gtsx/adapter-next-react/preview-route`.
- Render the adapter-provided SSR scripts before the preview client. The helper returns only the scripts needed for the current preview URL, so the route does not need to know internal Studio rendering details.
- `/gtsx/studio` page: pass the complete URL search string to `StudioShell` so canvas, selection, debug, and drilldown params survive server rendering.

### Next.js App Router Entry Templates

Use these templates when the project uses the App Router. Keep the route files thin; framework setup and search-param forwarding live here, preview/runtime logic does not.

`next.config.ts`:

```ts
import { gtsxNextReact } from "@gtsx/adapter-next-react"
import type { NextConfig } from "next"

import gtsxConfig from "./gtsx.config"

const nextConfig: NextConfig = {}

export default gtsxNextReact({ config: gtsxConfig })(nextConfig)
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
    serve: "HOST=127.0.0.1 PORT={port} pnpm dev",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

`app/gtsx/preview-client.tsx`:

```tsx
"use client"

export { GTSXNextPreviewClient as GTSXPreviewClient } from "@gtsx/adapter-next-react/preview"
```

`app/gtsx/page.tsx`:

```tsx
import {
  createGTSXNextPreviewSsrScripts,
  readGTSXNextPreviewProps,
} from "@gtsx/adapter-next-react/preview-route"
import Script from "next/script"

import { GTSXPreviewClient } from "./preview-client"

type GTSXPreviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXPreviewPage(props: GTSXPreviewPageProps) {
  const searchParams = await props.searchParams
  const previewProps = readGTSXNextPreviewProps(searchParams)

  return (
    <>
      {createGTSXNextPreviewSsrScripts(previewProps).map((scriptProps) => (
        <Script key={scriptProps.id} {...scriptProps} />
      ))}
      <GTSXPreviewClient {...previewProps} />
    </>
  )
}
```

`app/gtsx/studio/studio-manifest.ts`:

```ts
import { createStudioManifestProvider } from "@gtsx/studio/manifest-server"

export const getStudioManifest = createStudioManifestProvider()
```

`app/gtsx/studio/page.tsx`:

```tsx
import { StudioShell } from "@gtsx/studio/client"
import { studioUrlSearchFromSearchParams } from "@gtsx/studio/manifest"

import { getStudioManifest } from "./studio-manifest"

type GTSXStudioPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXStudioPage(props: GTSXStudioPageProps) {
  const searchParams = await props.searchParams

  return (
    <StudioShell
      manifest={getStudioManifest()}
      urlSearch={studioUrlSearchFromSearchParams(searchParams)}
    />
  )
}
```

`app/gtsx/studio/manifest/route.ts`:

```ts
import { getStudioManifest } from "../studio-manifest"

export function GET() {
  return Response.json(getStudioManifest())
}
```

## Vite React

- Configure `gtsxViteReact` from `@gtsx/adapter-vite-react`.
- Pass the project `gtsx.config.ts` to `gtsxViteReact({ config: gtsxConfig })`.
- Preview entry uses `GTSXVitePreviewClient`, `readGTSXPreviewRouteParams`, `createGTSXVitePreviewComponentLoader`, and `import.meta.glob<GTSXPreviewModule>("./**/*.g.tsx")` from `@gtsx/adapter-vite-react/preview`.
- Keep the route entry thin — no preview runtime logic in the app.
- The single-entry Vite template is client-rendered and does not need the Next.js SSR scripts. For Vite-based SSR frameworks, use the framework adapter's SSR script entry when one is provided.

### Vite Single-Entry Template

`vite.config.ts`:

```ts
import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import gtsxConfig from "./gtsx.config"

export default defineConfig({
  optimizeDeps: {
    exclude: ["gtsx"],
  },
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
    serve: "HOST=127.0.0.1 PORT={port} pnpm dev",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

`src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client"
import { StudioShell, createStudioManifestFromGTSXConfig } from "@gtsx/studio"
import gtsxConfig from "virtual:gtsx/config"
import projectIndex from "virtual:gtsx/project-index"

import { GTSXPreviewApp } from "./preview"

const studioManifest = createStudioManifestFromGTSXConfig(projectIndex, gtsxConfig)
const app = window.location.pathname === "/gtsx/studio" ? <StudioShell manifest={studioManifest} /> : <GTSXPreviewApp />

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

1. Run the project typecheck.
2. Run `gtsx check` against the scope or a `.g.tsx` file.
3. Start the Host dev server.
4. Open `/gtsx/studio`.
5. Confirm the manifest contains only TypeScript Program `.g.tsx` entries.
6. Render at least one component card.
7. Open that card's `/gtsx?...` preview URL — confirm no `Missing entry`, `Unknown gtsx entry`, or `Unknown gtsx case` errors.
8. For Next.js projects, confirm the `/gtsx` route renders adapter SSR scripts before the preview client and that Studio cards render without a pre-hydration "Missing entry" flash.
9. For components with child `.g.tsx` dependencies, confirm root-level Studio shows only top-level components; children are reachable by drilldown.
10. Run capture if configured.

## Report

After completion, tell the user:

- Files changed
- Packages installed
- Selected TypeScript project
- Selected Host
- Verification results
- Any skipped steps
- The Studio URL to open (e.g. `http://localhost:3000/gtsx/studio`)
