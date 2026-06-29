# Server Runtime

Use this profile when the host owns server routes, server rendering, static route generation, or islands. Next.js App Router is the validated profile. For Next.js Pages Router, Remix / React Router framework mode, TanStack Start, Astro React islands, Gatsby, and similar hosts, inspect the host-native route and bundler hooks, then adapt this generic contract.

## Packages

Install:

- `@runelight/core`
- `@runelight/react`

Use a validated adapter package when one matches the host. For custom server hosts, build the smallest host adapter on top of the `@runelight/react/preview` adapter runtime API; keep that import in integration glue, not ordinary app components, and do not install legacy preview packages.

## Contract

1. Add `runelight.config.ts` with the selected framework contract, TypeScript project, `project.entryRoot`, and the server dev command recorded as `host.command` with the `{port}` placeholder.
2. Add the framework/bundler transform hook for `.g.tsx`.
3. Add `/runelight/session` and return the `serveSession` identity expected by `runelight serve`.
4. Add `/runelight` and delegate route parsing, SSR bootstrap scripts, and preview loading to a framework adapter or the `@runelight/react/preview` adapter runtime API.
5. Preserve all existing framework config wrappers and production routes.
6. In upgrade/ensure mode, do not rewrite existing config, adapter wrappers, route files, or preview helpers if they already pass verification; after package upgrades, migrate only glue proven incompatible by typecheck, adapter contracts, or runtime verification.
7. Verify project typecheck, `runelight check`, `/runelight/session`, one `/runelight?...` preview URL, and an existing app route.

## Host Requirements

Do not write an app-local preview runtime. Use framework-native hooks for these pieces:

- Bundler transform hook.
- Preview component discovery.
- Server route shape.
- SSR bootstrap script insertion.
- Session route.
- Dev server URL construction.

When these requirements are present, apply the contract above through the host's existing server and build conventions.

## Session Endpoint

For custom server hosts, `/runelight/session` is a host-native route used by `runelight serve` and `runelight capture` as the readiness and identity check. Expose it only when `RUNELIGHT_DEV=1`; production/default app runs should return 404 or otherwise avoid a usable Runelight session endpoint.

Return JSON with `cache-control: no-store`:

```json
{
  "serveSession": {
    "projectKey": "<RUNELIGHT_PROJECT_KEY>",
    "sessionId": "<RUNELIGHT_SESSION_ID>"
  }
}
```

Read `projectKey` and `sessionId` from the matching environment variables passed to the Host command. Do not substitute a static `{ "ok": true }` health response; the CLI uses this identity to verify it is attached to the current Runelight serve session.
