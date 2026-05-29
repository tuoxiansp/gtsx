# Next.js App Router

Use this profile for Next.js App Router projects. setup-gtsx 0.0.1 does not provide a validated Pages Router integration profile.

## Packages

Install:

- `@gtsx/core`
- `@gtsx/studio`
- `@gtsx/adapter-next-react`

Do not install `@gtsx/preview-react` directly.

## Configuration

- Wrap config with `gtsxNextReact` from `@gtsx/adapter-next-react`.
- Pass the project `gtsx.config.ts` to `gtsxNextReact({ config: gtsxConfig })`.
- The adapter generates `.gtsx/preview-entries.ts` and wires webpack/Turbopack.
- Preserve existing Next.js config wrappers. If the project exports `withMDX(nextConfig)`, `withContentlayer(nextConfig)`, `createNextIntlPlugin(...)(nextConfig)`, or another wrapper, apply `gtsxNextReact({ config: gtsxConfig })` around the existing composed config.
- Use `project.root: "."` for root-level `app`, `components`, or `lib`; use `src` only when the app source lives under `src`.
- Be careful with package-manager argument separators: npm needs `npm run dev -- --hostname 127.0.0.1 --port {port}` while pnpm should use `pnpm dev --hostname 127.0.0.1 --port {port}`.

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
import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    root: ".",
    namespace: "my-project",
  },
  routes: {
    preview: "/gtsx",
    studio: "/gtsx/studio",
    manifest: "/gtsx/studio/manifest",
  },
  preview: {
    serve: "npm run dev -- --hostname 127.0.0.1 --port {port}",
    studioUrl: "http://127.0.0.1:{port}/gtsx/studio",
    url: "http://127.0.0.1:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://127.0.0.1:{port}/gtsx?entry={entry}{gcase}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

## Route Files

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
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
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
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>
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

## Verify

1. Run typecheck/build.
2. Run `gtsx check`.
3. Start Next dev server.
4. Open `/gtsx/studio/manifest`.
5. Open `/gtsx/studio`.
6. If a `.g.tsx` entry exists, open one `/gtsx?...` preview URL.
7. Confirm adapter SSR scripts render before the preview client and Studio cards render without a pre-hydration `Missing entry` flash.
8. Confirm an existing app route still renders.
