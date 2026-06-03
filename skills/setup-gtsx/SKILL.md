---
name: setup-gtsx
description: Install, upgrade, or ensure gtsx Studio in a TypeScript React project. Detects the TypeScript project and React host topology, routes to the matching integration profile, uses validated profiles for Vite React and Next.js App Router when possible, adapts other TypeScript React hosts through client-runtime or server-runtime contracts, and verifies the integration end-to-end. Use when a project asks for "install gtsx", "set up gtsx", "upgrade gtsx", or "update gtsx".
---

# Install Or Upgrade gtsx In This Project

Install, upgrade, or repair the smallest working gtsx integration for a TypeScript React project. This skill normally runs after a bootstrap prompt has installed the gtsx skills and routed the coding assistant here. Inspect project shape, preserve existing app behavior, and do not migrate components unless the user explicitly asked.

This file is the router. Read the detection profile first, then enter exactly one primary integration profile.

## Integration Profiles

1. Always start with [Project Detection](profiles/00-detect-project.md).
2. If the project is Vite React TypeScript, Vite React with React Router, or a Vite-compatible client SPA, use [Vite React](profiles/vite-react.md).
3. If the project is Next.js App Router, use [Next.js App Router](profiles/next-app-router.md).
4. If the project is client-only React but not Vite, use [Client Runtime](profiles/client-runtime.md) and adapt the generic contract to the host.
5. If the project owns server routes, SSR, static route generation, or islands, use [Server Runtime](profiles/server-runtime.md) and adapt the generic contract to the host.

## Mode Selection

- If the project has no gtsx packages, `gtsx.config.ts`, adapter wrapper, or `/gtsx` route/browser entry, run first-time setup.
- If any existing gtsx package, config, adapter wrapper, route, or browser entry is present, run upgrade/ensure mode first.
- In upgrade/ensure mode:
  - upgrade `@gtsx/core`, `@gtsx/studio`, and the selected adapter package to compatible current versions;
  - run an upgrade compatibility audit before deciding glue code is still valid;
  - preserve existing `gtsx.config.ts`, route files, framework config wrappers, browser entry branches, Studio URLs, preview URLs, and `.gtsx/preview-entries.ts` import patterns unless the audit shows a package-version contract change requires a minimal migration;
  - create the conventional design directory at `project.root/gtsx/design` if it is missing;
  - restart or ask the user to restart the dev server so adapter-generated files such as `.gtsx/preview-entries.ts` can be refreshed;
  - verify `/gtsx/studio`, `/gtsx/studio#/design`, `/gtsx/studio/manifest`, and at least one preview URL when entries exist.
- Only use profile templates to fill missing or demonstrably broken glue. Do not overwrite working local integration code just to match the examples.

## Upgrade Compatibility Audit

When upgrade/ensure mode updates package versions, the agent must self-check whether the local integration still matches the installed package contracts:

- Inspect current and target gtsx package versions from `package.json`, lockfile, and installed package metadata when available.
- Inspect the installed adapter exports, type errors, local docs, or examples that come with the package before assuming an old route/config shape still works.
- Run typecheck and gtsx verification after the package update. Treat changed imports, missing exports, changed route helper signatures, manifest shape changes, or adapter-generated file errors as evidence that glue migration is required.
- If migration is required, make the smallest compatible edit to the existing local glue. Preserve app-specific wrappers, route structure, preview commands, visual CSS setup, and custom providers unless they directly conflict with the new contract.
- Report the audit result: packages upgraded, whether glue was unchanged or migrated, which files changed, and the concrete reason for any glue edit.

## Global Rules

- Install packages from npm as `@gtsx/core`, `@gtsx/studio`, and the selected adapter package.
- Never add `@gtsx/preview-react` directly to the user project; it is adapter internals.
- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, and adapter loading.
- The preview route must recreate the component visual environment that the normal app route would provide through CSS or static DOM: global styles, design-system stylesheets, font/style setup imports, and root theme/style classes or `data-*` attributes.
- Keep preview route shells static. Do not wrap the preview client in production layouts or providers that run ordinary React hooks, auth/session clients, data fetchers, routers, or effects. If visual context is needed, prefer CSS imports, static wrapper elements, and gtsx `createGProvider` frames.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, frame override merging, or scope fallback logic.
- Keep existing app routes, config wrappers, router entrypoints, providers, and production behavior intact.
- Treat the installer as idempotent: re-running it must not duplicate wrappers/routes, reset project structure, or erase local gtsx customizations.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## After Setup

Route to sibling skills for component work:

- `authoring-gtsx` — write new `.g.tsx` components and frames.
- `refactor-to-gtsx` — convert existing TSX components into `.g.tsx`.
- `design-gtsx` — create and iterate `project.root/gtsx/design` frames in Studio's design workspace.
