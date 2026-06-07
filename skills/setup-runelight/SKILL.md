---
name: setup-runelight
description: Install, upgrade, or ensure Runelight Studio in a TypeScript React or Vue project. Use when a project asks for "install Runelight", "set up Runelight", "upgrade Runelight", or "update Runelight"; this project-level bootstrap skill detects the host, wires the integration, installs only the needed project-level companion skills, and verifies end-to-end.
---

# Install Or Upgrade Runelight In This Project

Install, upgrade, or repair the smallest working Runelight integration for a TypeScript React or Vue project. This skill is installed first into the target project's `.agents/skills/setup-runelight` by the installer prompt, then it installs only the companion skills needed for the detected project. Inspect project shape, preserve existing app behavior, and do not migrate components unless the user explicitly asked.

This file is the router. Read the detection profile first, then enter exactly one primary integration profile.

## Integration Profiles

1. Always start with [Project Detection](profiles/00-detect-project.md).
2. If the project is Vite React TypeScript, Vite React with React Router, or a Vite-compatible client SPA, use [Vite React](profiles/vite-react.md).
3. If the project is Vite Vue 3 TypeScript, use [Vite Vue](profiles/vite-vue.md).
4. If the project is Next.js App Router, use [Next.js App Router](profiles/next-app-router.md).
5. If the project is client-only React but not Vite, use [Client Runtime](profiles/client-runtime.md) and adapt the generic contract to the host.
6. If the project owns server routes, SSR, static route generation, or islands, use [Server Runtime](profiles/server-runtime.md) and adapt the generic React contract to the host.

## Mode Selection

- If the project has no Runelight packages, `runelight.config.ts`, adapter wrapper, or `/runelight` route/browser entry, run first-time setup.
- If any existing Runelight package, config, adapter wrapper, route, or browser entry is present, run upgrade/ensure mode first.
- In upgrade/ensure mode:
  - treat `@runelight/core`, `@runelight/studio`, and the selected adapter package as one compatibility group; align them to compatible current npm versions and update the lockfile;
  - run an upgrade compatibility audit before deciding glue code is still valid;
  - preserve existing `runelight.config.ts`, route files, framework config wrappers, browser entry branches, Studio URLs, preview URLs, and `.runelight/preview-entries.ts` import patterns unless the audit shows a package-version contract change requires a minimal migration;
  - ensure `runelight.config.ts` records `project.entryRoot`, then create `${project.entryRoot}/design` if it is missing;
  - restart or ask the user to restart the dev server so adapter-generated files such as `.runelight/preview-entries.ts` can be refreshed;
  - verify `/runelight/studio`, `/runelight/studio#/design`, `/runelight/studio/manifest`, and at least one preview URL when entries exist.
- Only use profile templates to fill missing or demonstrably broken glue. Do not overwrite working local integration code just to match the examples.

## Upgrade Compatibility Audit

When upgrade/ensure mode updates package versions, the agent must self-check whether the local integration still matches the installed package contracts:

- Inspect current and target Runelight package versions from `package.json`, lockfile, and installed package metadata when available.
- Inspect the installed adapter exports, type errors, local docs, or examples that come with the package before assuming an old route/config shape still works.
- Run typecheck and Runelight verification after the package update. Treat changed imports, missing exports, changed route helper signatures, manifest shape changes, or adapter-generated file errors as evidence that glue migration is required.
- If migration is required, make the smallest compatible edit to the existing local glue. Preserve app-specific wrappers, route structure, preview commands, visual CSS setup, and custom providers unless they directly conflict with the new contract.
- Report the audit result: packages upgraded, whether glue was unchanged or migrated, which files changed, and the concrete reason for any glue edit.

## Global Rules

- Install packages from npm as `@runelight/core`, `@runelight/studio`, and the selected adapter package.
- Never add `@runelight/preview-react` or `@runelight/preview-vue` directly to the user project; they are adapter internals.
- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, and adapter loading.
- The preview route must recreate the component visual environment that the normal app route would provide through CSS or static DOM: global styles, design-system stylesheets, font/style setup imports, and root theme/style classes or `data-*` attributes.
- Keep preview route shells static. Do not wrap the preview client in production layouts or providers that run ordinary React hooks, auth/session clients, data fetchers, routers, or effects. If visual context is needed, prefer CSS imports, static wrapper elements, and Runelight `createGProvider` frames.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, frame override merging, or scope fallback logic.
- Keep existing app routes, config wrappers, router entrypoints, providers, and production behavior intact.
- Treat the installer as idempotent: re-running it must not duplicate wrappers/routes, reset project structure, or erase local Runelight customizations.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## Project-Level Companion Skills

Do not install the full Runelight skill set globally. During setup, install or refresh only the companion skills needed by the detected project into the target project's `.agents/skills`.

Fetch or copy companion skill directories from the Runelight source repository into `.agents/skills/<skill-name>` in the target project. Use these source paths as the source of truth:

| Project type | Project-level skills to install |
| --- | --- |
| React | `skills/authoring-runelight-react`, `skills/refactor-to-runelight`, `skills/design-runelight` |
| Vue | `skills/authoring-runelight-vue` |

If a companion skill is already present in `.agents/skills`, refresh it from the current Runelight source before relying on it. Do not write these companion skills into the user's global skills directory, and do not install irrelevant framework skills.

## After Setup

Route to sibling skills for component work:

- `authoring-runelight-react` — write new React `.g.tsx` components and frames.
- `authoring-runelight-vue` — write new Vue `.g.vue` components and frames.
- `refactor-to-runelight` — convert existing TSX components into `.g.tsx`.
- `design-runelight` — create and iterate `project.entryRoot/design` frames in Studio's design workspace.
