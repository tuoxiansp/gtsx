# Runelight Troubleshooting

Common integration and Studio issues. For agent-driven diagnosis, use [`diagnose-runelight`](../skills/diagnose-runelight/SKILL.md).

## Configuration

### `Missing host.command in runelight.config.ts`

`runelight serve` and `runelight capture` need `host.command` with a `{port}` placeholder. See [Configuration](./runelight-config.md).

### `Missing project.entryRoot`

Run `setup-runelight` or set `project.entryRoot` to the directory that owns your `/runelight` integration (usually `app/runelight` or `src/app/runelight`). Design frames belong in `${project.entryRoot}/design/`.

### Obsolete `preview` or `routes` keys in config

Remove `preview.serve`, `preview.url`, and custom `routes` blocks. Use `host.command` only; routes are fixed defaults.

## Studio and manifest

### Studio is empty or missing frames

1. Confirm `project.entryRoot` and `project.sourceRoot` in `runelight.config.ts`.
2. Run `runelight check` on your source tree.
3. Restart the dev server after adding the first `.g.*` or design frame (adapter-generated registries may need refresh).
4. Open `/runelight/studio/manifest` — expect JSON listing `.g.tsx` or `.g.vue` coordinates.

### Design board (`#/design`) has no frames

- Files must live under `${project.entryRoot}/design/`, not `.runelight/`.
- Each design file needs one frame named `live`.
- Reload Studio after creating the first design file.

### `Missing entry` / `Unknown Runelight entry` in preview

- Check the `entry` query param matches manifest coordinates (e.g. `src/Badge.g.tsx#default`).
- URL-encode path segments in manual preview URLs.

## Next.js App Router

### `/runelight` runs production layout hooks or fetches app data

A page cannot opt out of ancestor layouts. If `app/layout.tsx` mounts providers, auth, or data clients, `/runelight` inherits them.

**Fix:** isolate with route groups — keep `app/runelight/*` outside the production shell:

```txt
app/layout.tsx              # minimal document shell only
app/(app)/layout.tsx        # production shell
app/(app)/page.tsx
app/runelight/page.tsx
app/runelight/studio/...
```

See [Next.js profile](../skills/setup-runelight/profiles/next-app-router.md#app-router-layout-boundary-audit-and-remediation).

`runelight check` validates protocol files only — it does not prove the layout chain is clean.

## Vite

### Preview glob cannot resolve design frames

Use one static glob for `${project.entryRoot}/design/**/*.g.{tsx|vue}` — match the recorded `entryRoot` (e.g. `/app/runelight/design/**` vs `/src/app/runelight/design/**`). Do not list multiple candidate globs.

### Production build fails on `virtual:runelight/*`

Preview code and virtual modules are dev-only. Production `vite build` must not import preview routes or `virtual:runelight/config` from app bundles.

## Vue

### `uncovered-vue-template-branch`

Add frame `scope` or `props` so every structural `v-if` / `v-for` / `:is` branch is reachable. See [Vue authoring guide](./runelight-authoring-guide-vue.md).

### Provide/inject preview wrong

Import the same injection key in `<g:frames lang="ts">` as in `<script setup>`. Use `provide: [[key, value]]` and `GVueProvideFrame` for finite axes.

## React

### `opaque-jsx-control-flow`

Rewrite branches as direct conditionals over props, scope, or `useGContext` — not helper predicates, `switch`, or stored JSX variables. See [Static Contract](./runelight-static-contract.md).

### `runelight serve` leaves processes after Ctrl-C

Follow [CLI serve lifecycle](../intelligence-tests/cli-serve-lifecycle.it.md) expectations. Inspect the port owner: `lsof -nP -iTCP:<port> -sTCP:LISTEN`.

## Production opt-in

Default production builds hide `/runelight` and Studio. To expose them in production builds, set `studio.exposeInProduction: true` and follow adapter-specific production route guidance in setup profiles.

## Related

- [CLI](./cli.md)
- [Configuration](./runelight-config.md)
- [Setup skill](../skills/setup-runelight/SKILL.md)
