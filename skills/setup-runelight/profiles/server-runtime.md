# Server Runtime

Use this profile when the host owns server routes, server rendering, static route generation, or islands. Next.js App Router is the validated profile. For Next.js Pages Router, Remix / React Router framework mode, TanStack Start, Astro React islands, Gatsby, and similar hosts, inspect the host-native route and bundler hooks, then adapt this generic contract.

## Packages

Install:

- `@runelight/core`
- `@runelight/react`
- `@runelight/studio`

Use a validated adapter package when one matches the host. For custom server hosts, build the smallest host adapter on top of `@runelight/react/preview` and `@runelight/studio/static-app`; do not install legacy preview packages.

## Contract

1. Add `runelight.config.ts` with the selected framework contract, TypeScript project, `project.entryRoot`, and the server dev command recorded as `host.command` with the `{port}` placeholder.
2. Add the framework/bundler transform hook for `.g.tsx`.
3. Add `/runelight/studio/manifest` and return the manifest from `createStudioManifestProvider`.
4. Add `/runelight/studio` and `/runelight/studio/assets/*` by serving the prebuilt app from `@runelight/studio/static-app`.
5. Add `/runelight` and delegate route parsing, SSR bootstrap scripts, and preview loading to a framework adapter or the low-level `@runelight/react/preview` APIs.
6. Create the empty `${project.entryRoot}/design` directory. Do not add a `designRoot` config key or placeholder frames.
7. Preserve all existing framework config wrappers and production routes.
8. In upgrade/ensure mode, do not rewrite existing config, adapter wrappers, route files, or preview helpers if they already pass verification; after package upgrades, migrate only glue proven incompatible by typecheck, adapter contracts, or runtime verification.
9. Verify project typecheck, `runelight check`, `/runelight/studio/manifest`, `/runelight/studio`, one `/runelight?...` preview URL, and an existing app route.

## Host Requirements

Do not write an app-local preview runtime. Use framework-native hooks for these pieces:

- Bundler transform hook.
- Preview component discovery.
- Server route shape.
- SSR bootstrap script insertion.
- Manifest route.
- Dev server URL construction.

When these requirements are present, apply the contract above through the host's existing server and build conventions.
