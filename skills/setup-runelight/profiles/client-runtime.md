# Client Runtime

Use this profile when a TypeScript React host has one browser-owned entry and browser-owned routing. Vite React is the validated profile, but the same contract can be adapted to Vite-powered React Router, TanStack Router SPA, CRA / Webpack, and isolated Electron + Vite renderer projects.

## Packages

Install:

- `@runelight/core`
- `@runelight/react`

Use a validated adapter package when one matches the host. For custom client hosts, build the smallest host adapter on top of the `@runelight/react/preview` adapter runtime API; keep that import in integration glue, not ordinary app components, and do not install legacy preview packages.

## Contract

1. Add `runelight.config.ts` with `contracts`, `project.sourceRoot`, `project.entryRoot`, `project.tsconfig`, and a `host.command` that `runelight serve` can wrap.
2. Add a bundler transform so every `.g.tsx` file runs through the Runelight React transform.
3. Expose the resolved config to the preview entry.
4. Serve `/runelight/session` from the host dev server with the `serveSession` identity expected by `runelight serve`.
5. In the browser entry, branch only on `/runelight` for preview. Every other browser route keeps the existing app/router.
6. Load preview components through adapter helpers, or through the `@runelight/react/preview` adapter runtime API when writing a custom host adapter. Do not hand-roll preview query parsing, module key normalization, boundary collection, or iframe protocol.
7. In upgrade/ensure mode, do not rewrite existing config, bundler glue, browser-entry branches, or preview helpers if they already pass verification; after package upgrades, migrate only glue proven incompatible by typecheck, adapter contracts, or runtime verification.
8. Verify the original app route still renders.

## Host Requirements

This setup path requires:

- A bundler transform hook for `.g.tsx`.
- A safe way to discover preview component modules.
- A dev server hook that can serve `/runelight/session`.
- A browser entry branch for `/runelight` preview that preserves the existing app.
- A dev server command that can bind a deterministic host and accept the `{port}` placeholder, recorded as `host.command`.

When these requirements are present, apply the contract above through the host's existing build and routing conventions.

## Session Endpoint

For custom hosts, `/runelight/session` is the readiness and identity check used by `runelight serve` and `runelight capture`. Expose it only when `RUNELIGHT_DEV=1`; production/default app runs should return 404 or otherwise avoid a usable Runelight session endpoint.

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
