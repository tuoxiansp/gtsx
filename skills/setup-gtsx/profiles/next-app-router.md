# Next.js App Router

Use this profile for Next.js App Router projects. setup-gtsx does not currently provide a validated Pages Router integration profile.

## Packages

Install:

- `@gtsx/core`
- `@gtsx/studio`
- `@gtsx/adapter-next-react`

Do not install `@gtsx/preview-react` directly.

## Configuration

- Wrap config with `gtsxNextReact` from `@gtsx/adapter-next-react`.
- Use `gtsxNextReact()` without statically importing `gtsx.config.ts` from `next.config.*`; the adapter loads `gtsx.config.ts` only when preview entries are enabled.
- `.g.tsx` files are production React components. Do not move normal app imports away from `.g.tsx`; isolate only Studio, preview routes, generated preview entries, and config loading from production.
- The Next preview/studio integration is development-only by default. It must not mutate production `next build`, production server startup, Docker standalone output, or read/write `.gtsx` at production runtime unless the project explicitly opts in with `gtsxNextReact({ enabled: true, ... })`.
- The adapter generates `.gtsx/preview-entries.ts` and wires webpack/Turbopack for preview imports when preview entries are enabled. Do not add a custom `.g.tsx` Turbopack loader in app code.
- Record the local GTSX route entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`; do not add a `designRoot` config key.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames; the first `design-gtsx` request writes the first `.g.tsx` frame.
- In upgrade/ensure mode, do not rewrite `next.config.*`, `gtsx.config.ts`, or `app/gtsx/*` if they already exist and pass verification; only update packages and add missing design-directory support.
- After package upgrades, rerun Next.js typecheck/dev verification. If adapter exports, route helper signatures, generated `.gtsx/preview-entries.ts`, or manifest generation changed, migrate only the affected glue while preserving existing route isolation and config-wrapper composition.
- Preserve existing Next.js config wrappers. If the project exports `withMDX(nextConfig)`, `withContentlayer(nextConfig)`, `createNextIntlPlugin(...)(nextConfig)`, or another wrapper, apply `gtsxNextReact()` around the existing composed config without statically importing `gtsx.config.ts`.
- Use `project.sourceRoot: "."` for root-level `app`, `components`, or `lib`; use `src` only when the app source lives under `src`.
- Be careful with package-manager argument separators: npm needs `npm run dev -- --hostname 127.0.0.1 --port {port}` while pnpm should use `pnpm dev --hostname 127.0.0.1 --port {port}`.

`next.config.ts`:

```ts
import { gtsxNextReact } from "@gtsx/adapter-next-react"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default gtsxNextReact()(nextConfig)
```

`gtsx.config.ts`:

```ts
import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    sourceRoot: ".",
    entryRoot: "app/gtsx",
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
    url: "http://127.0.0.1:{port}/gtsx?entry={entry}&frame={frame}{gframe}",
    allUrl: "http://127.0.0.1:{port}/gtsx?entry={entry}{gframe}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

## Route Files

### App Router Layout Boundary Audit And Remediation

Before adding `app/gtsx/*`, audit and clean the route layout chain that will wrap `/gtsx` and `/gtsx/studio`. Treat this as a setup gate, not a browser-only verification step.

For App Router projects, a `page.tsx` cannot opt out of ancestor layouts. If `app/layout.tsx` or any parent segment layout mounts production shell code, `/gtsx` will execute that code too. That includes ordinary client components, providers, router hooks, timers, subscriptions, and network/query effects. Passing `gtsx check` does not prove this boundary is clean; `gtsx check` validates `.g.tsx` entries and their resolvable `.g.tsx` dependencies, not the Next.js layout tree.

Inspect these files before writing the route files, and follow imports far enough to classify each inherited wrapper:

- `app/layout.tsx` or `src/app/layout.tsx`.
- Any parent layout that would wrap the chosen preview route, including route groups.
- Imported client components from those layouts, especially providers and app shell components.

Use source inspection first. Search the inherited layout chain and its imported wrappers for risk markers such as `"use client"`, React effects, framework router hooks, app providers, app clients, timers, subscriptions, browser storage, and network I/O. Treat these as structural risks because they can run host application behavior before the GTSX adapter preview client renders.

The preview/studio route is clean only if the inherited layout chain is limited to static document and visual setup: `<html>`, `<body>`, global CSS imports, font classes, static theme classes or `data-*` attributes, metadata, and non-hook bootstrap scripts.

If the root layout contains production shell behavior, remove the risk before claiming setup is complete. Do not hide it in `app/gtsx/page.tsx`, and do not rely on runtime guards inside preview/studio. The supported App Router remediation is to isolate layouts with route groups:

```txt
app/layout.tsx              # minimal document shell only
app/(app)/layout.tsx        # production shell and app behavior
app/(app)/page.tsx          # normal app routes
app/gtsx/page.tsx           # gtsx preview, outside the production shell
app/gtsx/studio/page.tsx    # gtsx studio, outside the production shell
```

When applying that remediation:

- Preserve public URLs; route group folder names like `(app)` do not appear in URLs.
- Move only production route segments under the production route group. Keep `app/gtsx/*` outside it.
- Leave the root layout as the minimal document and visual shell shared by all routes.
- Keep production providers, navigation, app clients, subscriptions, and data fetching inside the production route group layout.
- Copy only visual setup needed by GTSX into the minimal root layout or the `/gtsx` static wrapper: CSS imports, font classes, theme attributes, and non-hook bootstrap scripts.

If route-group remediation would require broad routing migration that is unsafe to infer, stop and report the exact blocker. Do not claim the Next.js App Router setup is isolated when `/gtsx` inherits hookful production layouts.

Before writing the route files, identify the visual environment used by the components being previewed:

- CSS imported by the relevant app layout or route group.
- Design-system or registry CSS that is not part of the root layout.
- Static root classes or `data-*` attributes that select a theme, base color, density, or style preset.
- Font/style setup imports that affect component measurements.

The `/gtsx` preview route must load those visual pieces too. This route is a preview adapter entry, not the production app shell: use imports and static wrappers, not hookful production providers or layouts.

`app/gtsx/preview-client.tsx`:

```tsx
"use client"

export { GTSXNextPreviewClient as GTSXPreviewClient } from "@gtsx/adapter-next-react/preview"
```

`app/gtsx/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import Script from "next/script"

type GTSXPreviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXPreviewPage(props: GTSXPreviewPageProps) {
  if (process.env.NODE_ENV === "production") notFound()

  const searchParams = await props.searchParams
  const [{ createGTSXNextPreviewSsrScripts, readGTSXNextPreviewProps }, { GTSXPreviewClient }] = await Promise.all([
    import("@gtsx/adapter-next-react/preview-route"),
    import("./preview-client"),
  ])
  const previewProps = readGTSXNextPreviewProps(searchParams)

  return (
    <>
      {createGTSXNextPreviewSsrScripts(previewProps).map((scriptProps) => (
        <Script key={scriptProps.id} {...scriptProps} />
      ))}
      <div className="contents">
        <GTSXPreviewClient {...previewProps} />
      </div>
    </>
  )
}
```

Replace the `contents` wrapper with the project's static visual shell when needed, for example a style/base-color class wrapper. Do not use a production provider component just to get those classes if that provider runs hooks.

`app/gtsx/studio/studio-manifest.ts`:

```ts
import { createStudioManifestProvider } from "@gtsx/studio/manifest-server"

export const getStudioManifest = createStudioManifestProvider()
```

`app/gtsx/studio/page.tsx`:

```tsx
import { notFound } from "next/navigation"

type GTSXStudioPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXStudioPage(props: GTSXStudioPageProps) {
  if (process.env.NODE_ENV === "production") notFound()

  const searchParams = await props.searchParams
  const [{ StudioShell }, { studioUrlSearchFromSearchParams }, { getStudioManifest }] = await Promise.all([
    import("@gtsx/studio/client"),
    import("@gtsx/studio/manifest"),
    import("./studio-manifest"),
  ])

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
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 })

  const { getStudioManifest } = await import("../studio-manifest")
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
7. Confirm the App Router layout boundary audit was completed and any hookful production shell was moved out of the inherited `/gtsx` layout chain.
8. Watch the browser network panel or Next.js server console while loading `/gtsx/studio` and `/gtsx?...`. This is a regression check after source-level remediation: the preview/studio shell should not trigger host application I/O. Framework assets, HMR/dev tooling, static assets, and GTSX preview/studio routes are expected; app-owned API calls indicate the inherited layout chain is still polluted. If they appear, return to the App Router layout boundary audit.
9. Confirm adapter SSR scripts render before the preview client and Studio cards render without a pre-hydration `Missing entry` flash.
10. Confirm an existing app route still renders.
