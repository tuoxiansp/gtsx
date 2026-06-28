---
name: setup-runelight
description: Install, upgrade, or ensure Runelight Studio in a TypeScript React project or TypeScript Vue 3 project. Use when a project asks for "install Runelight", "set up Runelight", "upgrade Runelight", or "update Runelight"; this bootstrap skill detects the host, wires the integration, and verifies end-to-end.
---

# Install Or Upgrade Runelight In This Project

Install, upgrade, or repair the smallest working Runelight integration for a TypeScript React project or TypeScript Vue 3 project. Inspect project shape, preserve existing app behavior, and do not migrate components unless the user explicitly asked.

This file is the router. Read the detection profile first, then enter exactly one primary integration profile.

## Integration Profiles

1. Always start with [Project Detection](profiles/00-detect-project.md).
2. If the project is Vite React TypeScript, Vite React with React Router, or a Vite-compatible TypeScript client SPA, use [Vite React](profiles/vite-react.md).
3. If the project is Vite Vue 3 TypeScript, use [Vite Vue](profiles/vite-vue.md).
4. If the project is Next.js App Router TypeScript, use [Next.js App Router](profiles/next-app-router.md).
5. If the project is client-only TypeScript React but not Vite, use [Client Runtime](profiles/client-runtime.md) and adapt the generic contract to the host.
6. If the project owns server routes, SSR, static route generation, or islands, use [Server Runtime](profiles/server-runtime.md) and adapt the generic React contract to the host.

## Mode Selection

- If the project has no Runelight packages, Runelight config, adapter wrapper, or `/runelight` route/browser entry, run first-time setup.
- If any existing Runelight package, config, adapter wrapper, route, or browser entry is present, run upgrade/ensure mode first.
- In upgrade/ensure mode:
  - treat `@runelight/core`, `@runelight/studio`, the selected framework package, and the selected adapter package as one compatibility group; align them to compatible current npm versions and update the lockfile;
  - run an upgrade compatibility audit before deciding glue code is still valid;
  - preserve existing Runelight config, route files, framework config wrappers, browser entry branches, Studio URLs, preview URLs, and adapter-generated preview entry wiring unless the audit shows a package-version contract change requires a minimal migration;
  - ensure the Runelight config records `project.entryRoot`;
  - restart or ask the user to restart the dev server so adapter-generated files such as preview entry registries can be refreshed;
  - verify `/runelight/studio`, `/runelight/studio/manifest`, and at least one preview URL when entries exist.
- Only use profile templates to fill missing or demonstrably broken glue. Do not overwrite working local integration code just to match the examples.

## Upgrade Compatibility Audit

When upgrade/ensure mode updates package versions, the agent must self-check whether the local integration still matches the installed package contracts:

- Inspect current and target Runelight package versions from `package.json`, lockfile, and installed package metadata when available.
- Inspect the installed adapter exports, type errors, local docs, or examples that come with the package before assuming an old route/config shape still works.
- Run typecheck and Runelight verification after the package update. Treat changed imports, missing exports, changed route helper signatures, manifest shape changes, or adapter-generated file errors as evidence that glue migration is required.
- If migration is required, make the smallest compatible edit to the existing local glue. Preserve app-specific wrappers, route structure, preview commands, visual CSS setup, and custom providers unless they directly conflict with the new contract.
- Report the audit result: packages upgraded, whether glue was unchanged or migrated, which files changed, and the concrete reason for any glue edit.

## Global Rules

- Install packages from npm as `@runelight/core`, `@runelight/studio`, the selected framework package (`@runelight/react` or `@runelight/vue`), and the selected adapter package for validated setup profiles.
- Import framework authoring helpers from the selected package's `/runtime` subpath (`@runelight/react/runtime` or `@runelight/vue/runtime`); use `/contract` in `runelight.config.ts` and `/preview` only when implementing a custom adapter layer.
- Do not install legacy preview packages. Custom integration profiles may use the selected framework package's low-level preview subpath (`@runelight/react/preview` or `@runelight/vue/preview`) when implementing their own adapter layer.
- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, and adapter loading.
- The preview route must recreate the component visual environment that the normal app route would provide through CSS or static DOM: global styles, design-system stylesheets, font/style setup imports, and root theme/style classes or `data-*` attributes.
- Keep preview route shells static. Do not wrap the preview client in production layouts or providers that run ordinary React hooks, auth/session clients, data fetchers, routers, or effects. If visual context is needed, prefer CSS imports, static wrapper elements, and Runelight `createGProvider` frames.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, frame override merging, or scope fallback logic.
- Keep existing app routes, config wrappers, router entrypoints, providers, and production behavior intact.
- Put generated project-local Runelight files under `${project.entryRoot}/.runelight/`, and ensure the project `.gitignore` contains the directory pattern `.runelight/`. Do not add a path-specialized ignore rule such as `${project.entryRoot}/.runelight/`; `.runelight/` covers generated Runelight directories at any depth. Choose `project.entryRoot` inside the app's authored source tree, such as `src/app/runelight` for `src/app` projects, so generated registries and baselines stay importable without user-authored glue imports or extra adapter output configuration.
- Treat the installer as idempotent: re-running it must not duplicate wrappers/routes, reset project structure, or erase local Runelight customizations.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## Project-Level Companion Skills

During setup, install or refresh the companion skills needed by the detected project as project-level skills.

Fetch or copy companion skill directories from the Runelight source repository into the target project's project-level skill location. Use these source paths as the source of truth:

| Project type | Project-level skills to install |
| --- | --- |
| React | `skills/authoring-runelight-react`, `skills/refactor-to-runelight-react`, `skills/polish` |
| Vue | `skills/authoring-runelight-vue`, `skills/refactor-to-runelight-vue`, `skills/polish` |

If a companion skill is already present, refresh it from the current Runelight source before relying on it. Do not install irrelevant framework skills. Do not install design skills by default; they are legacy/internal optional workflows for explicit design-draft work, not the setup path.

## After Setup

Route to sibling skills for component work:

- `authoring-runelight-react` — write new React `.g.tsx` components and frames.
- `authoring-runelight-vue` — write new Vue `.g.vue` components and frames.
- `refactor-to-runelight-react` — convert existing React TSX components into `.g.tsx`.
- `refactor-to-runelight-vue` — convert existing Vue SFCs into `.g.vue`.
- `polish` — polish Runelight-covered `.g.tsx` / `.g.vue` UI through an observe-edit-reobserve loop.
