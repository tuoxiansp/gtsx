# Server Runtime

Use this profile when the host owns server routes, server rendering, static route generation, or islands. Next.js App Router is the validated profile. For Next.js Pages Router, Remix / React Router framework mode, TanStack Start, Astro React islands, Gatsby, and similar hosts, inspect the host-native route and bundler hooks, then adapt this generic contract.

## Contract

1. Add `gtsx.config.ts` with selected TypeScript scope and server dev command.
2. Add the framework/bundler transform hook for `.g.tsx`.
3. Add `/gtsx/studio/manifest` and return the manifest from `createStudioManifestProvider`.
4. Add `/gtsx/studio` and render `StudioShell` from `@gtsx/studio/client`.
5. Add `/gtsx` and delegate route parsing, SSR bootstrap scripts, and preview loading to a framework adapter.
6. Preserve all existing framework config wrappers and production routes.
7. Verify project typecheck, `gtsx check`, `/gtsx/studio/manifest`, `/gtsx/studio`, one `/gtsx?...` preview URL, and an existing app route.

## Host Requirements

Do not write an app-local preview runtime. Use framework-native hooks for these pieces:

- Bundler transform hook.
- Preview component discovery.
- Server route shape.
- SSR bootstrap script insertion.
- Manifest route.
- Dev server URL construction.

When these requirements are present, apply the contract above through the host's existing server and build conventions.
