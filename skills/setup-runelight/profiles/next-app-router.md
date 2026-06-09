# Next.js App Router

Use this profile for Next.js App Router TypeScript projects. The setup-runelight skill does not currently provide a validated Pages Router integration profile.

## Packages

Install:

- `@runelight/core`
- `@runelight/studio`
- `@runelight/adapter-next-react`

Do not install `@runelight/preview-react` directly.

## Configuration

- Wrap config with `runelightNextReact` from `@runelight/adapter-next-react`.
- Use `runelightNextReact()` without statically importing the Runelight config from `next.config.*`; the adapter loads the Runelight config only when preview entries are enabled.
- `.g.tsx` files are production React components. Do not move normal app imports away from `.g.tsx`; isolate only preview routes, generated preview entries, Studio route helpers, and config loading from production.
- `@runelight/studio` ships a prebuilt Studio app. Next route files should call `@runelight/adapter-next-react/studio-route` helpers instead of importing `@runelight/studio/client`.
- The Next preview/studio integration is development-only by default. It must not mutate production `next build`, production server startup, Docker standalone output, or read/write `.runelight` at production runtime unless the project explicitly opts in with `runelightNextReact({ enabled: true, ... })`.
- The adapter generates `.runelight/preview-entries.ts` and wires webpack/Turbopack for preview imports when preview entries are enabled. Do not add a custom `.g.tsx` Turbopack loader in app code.
- Record the local Runelight route entry directory in `project.entryRoot`. Design frames live in `${project.entryRoot}/design`; do not add a `designRoot` config key.
- During setup, create the empty `${project.entryRoot}/design` directory. Do not add placeholder frames; the first `design-runelight-react` request writes the first `.g.tsx` frame.
- In upgrade/ensure mode, do not rewrite `next.config.*`, Runelight config, or `app/runelight/*` if they already exist and pass verification; only update packages and add missing design-directory support.
- After package upgrades, rerun Next.js typecheck/dev verification. If adapter exports, route helper signatures, generated `.runelight/preview-entries.ts`, or manifest generation changed, migrate only the affected glue while preserving existing route isolation and config-wrapper composition.
- Preserve existing Next.js config wrappers. If the project exports `withMDX(nextConfig)`, `withContentlayer(nextConfig)`, `createNextIntlPlugin(...)(nextConfig)`, or another wrapper, apply `runelightNextReact()` around the existing composed config without statically importing the Runelight config.
- Use `project.sourceRoot: "."` for root-level `app`, `components`, or `lib`; use `src` only when the app source lives under `src`.
- Be careful with package-manager argument separators: npm needs `npm run dev -- --hostname 127.0.0.1 --port {port}` while pnpm should use `pnpm dev --hostname 127.0.0.1 --port {port}`.

`next.config.ts`:

```ts
import { runelightNextReact } from "@runelight/adapter-next-react"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default runelightNextReact()(nextConfig)
```

`runelight.config.ts`:

```ts
import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: ".",
    entryRoot: "app/runelight",
    namespace: "my-project",
  },
  host: {
    command: "npm run dev -- --hostname 127.0.0.1 --port {port}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
```

`runelight serve` substitutes `{port}` in `host.command`. Routes are Runelight defaults — do not add a `routes` key. For npm use `npm run dev -- --hostname ...`; for pnpm use `pnpm dev --hostname 127.0.0.1 --port {port}`.

## Route Files

### App Router Layout Boundary Audit And Remediation

Before adding `app/runelight/*`, audit and clean the route layout chain that will wrap `/runelight` and `/runelight/studio`. Treat this as a setup gate, not a browser-only verification step.

For App Router projects, a `page.tsx` cannot opt out of ancestor layouts. If `app/layout.tsx` or any parent segment layout mounts production shell code, `/runelight` will execute that code too. That includes ordinary client components, providers, router hooks, timers, subscriptions, and network/query effects. Passing `runelight check` does not prove this boundary is clean; `runelight check` validates `.g.tsx` entries and their resolvable `.g.tsx` dependencies, not the Next.js layout tree.

Inspect these files before writing the route files, and follow imports far enough to classify each inherited wrapper:

- `app/layout.tsx` or `src/app/layout.tsx`.
- Any parent layout that would wrap the chosen preview route, including route groups.
- Imported client components from those layouts, especially providers and app shell components.

Use source inspection first. Search the inherited layout chain and its imported wrappers for risk markers such as `"use client"`, React effects, framework router hooks, app providers, app clients, timers, subscriptions, browser storage, and network I/O. Treat these as structural risks because they can run host application behavior before the Runelight adapter preview client renders.

The preview/studio route is clean only if the inherited layout chain is limited to static document and visual setup: `<html>`, `<body>`, global CSS imports, font classes, static theme classes or `data-*` attributes, metadata, and non-hook bootstrap scripts.

If the root layout contains production shell behavior, remove the risk before claiming setup is complete. Do not hide it in `app/runelight/page.tsx`, and do not rely on runtime guards inside preview/studio. The supported App Router remediation is to isolate layouts with route groups:

```txt
app/layout.tsx              # minimal document shell only
app/(app)/layout.tsx        # production shell and app behavior
app/(app)/page.tsx          # normal app routes
app/runelight/page.tsx           # Runelight preview, outside the production shell
app/runelight/studio/route.ts    # prebuilt Runelight Studio HTML
app/runelight/studio/assets/[...asset]/route.ts
app/runelight/studio/manifest/route.ts
```

When applying that remediation:

- Preserve public URLs; route group folder names like `(app)` do not appear in URLs.
- Move only production route segments under the production route group. Keep `app/runelight/*` outside it.
- Leave the root layout as the minimal document and visual shell shared by all routes.
- Keep production providers, navigation, app clients, subscriptions, and data fetching inside the production route group layout.
- Copy only visual setup needed by Runelight into the minimal root layout or the `/runelight` static wrapper: CSS imports, font classes, theme attributes, and non-hook bootstrap scripts.

If route-group remediation would require broad routing migration that is unsafe to infer, stop and report the exact blocker. Do not claim the Next.js App Router setup is isolated when `/runelight` inherits hookful production layouts.

Before writing the route files, identify the visual environment used by the components being previewed:

- CSS imported by the relevant app layout or route group.
- Design-system or registry CSS that is not part of the root layout.
- Static root classes or `data-*` attributes that select a theme, base color, density, or style preset.
- Font/style setup imports that affect component measurements.

The `/runelight` preview route must load those visual pieces too. This route is a preview adapter entry, not the production app shell: use imports and static wrappers, not hookful production providers or layouts.

`app/runelight/preview-client.tsx`:

```tsx
"use client"

export { RunelightNextPreviewClient as RunelightPreviewClient } from "@runelight/adapter-next-react/preview"
```

`app/runelight/page.tsx`:

```tsx
import { notFound } from "next/navigation"
import Script from "next/script"

type RunelightPreviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function RunelightPreviewPage(props: RunelightPreviewPageProps) {
  if (process.env.NODE_ENV === "production") notFound()

  const searchParams = await props.searchParams
  const [{ createRunelightNextPreviewSsrScripts, readRunelightNextPreviewProps }, { RunelightPreviewClient }] = await Promise.all([
    import("@runelight/adapter-next-react/preview-route"),
    import("./preview-client"),
  ])
  const previewProps = readRunelightNextPreviewProps(searchParams)

  return (
    <>
      {createRunelightNextPreviewSsrScripts(previewProps).map((scriptProps) => (
        <Script key={scriptProps.id} {...scriptProps} />
      ))}
      <div className="contents">
        <RunelightPreviewClient {...previewProps} />
      </div>
    </>
  )
}
```

Replace the `contents` wrapper with the project's static visual shell when needed, for example a style/base-color class wrapper. Do not use a production provider component just to get those classes if that provider runs hooks.

`app/runelight/studio/route.ts`:

```ts
import { createRunelightNextStudioResponse } from "@runelight/adapter-next-react/studio-route"

export const dynamic = "force-dynamic"

export async function GET() {
  return createRunelightNextStudioResponse()
}
```

`app/runelight/studio/assets/[...asset]/route.ts`:

```ts
import { createRunelightNextStudioAssetResponse } from "@runelight/adapter-next-react/studio-route"

type RunelightStudioAssetRouteProps = {
  params: Promise<{ asset: string[] }> | { asset: string[] }
}

export const dynamic = "force-dynamic"

export async function GET(_request: Request, props: RunelightStudioAssetRouteProps) {
  const params = await props.params
  return createRunelightNextStudioAssetResponse(params.asset)
}
```

`app/runelight/studio/manifest/route.ts`:

```ts
import { createRunelightNextStudioManifestResponse } from "@runelight/adapter-next-react/studio-route"

export const dynamic = "force-dynamic"

export async function GET() {
  return createRunelightNextStudioManifestResponse()
}
```

## Verify

1. Run typecheck/build.
2. Run `runelight check`.
3. Start Next dev server.
4. Open `/runelight/studio/manifest`.
5. Open `/runelight/studio`.
6. If a `.g.tsx` entry exists, open one `/runelight?...` preview URL.
7. Confirm the App Router layout boundary audit was completed and any hookful production shell was moved out of the inherited `/runelight` layout chain.
8. Watch the browser network panel or Next.js server console while loading `/runelight/studio` and `/runelight?...`. This is a regression check after source-level remediation: the preview/studio shell should not trigger host application I/O. Framework assets, HMR/dev tooling, static assets, and Runelight preview/studio routes are expected; app-owned API calls indicate the inherited layout chain is still polluted. If they appear, return to the App Router layout boundary audit.
9. Confirm adapter SSR scripts render before the preview client and Studio cards render without a pre-hydration `Missing entry` flash.
10. Confirm an existing app route still renders.
