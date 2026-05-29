---
name: setup-gtsx
description: Install gtsx Studio into a TypeScript React project. Detects the TypeScript project and React host topology, routes to the matching integration profile, uses validated profiles for Vite React and Next.js App Router when possible, adapts other TypeScript React hosts through client-runtime or server-runtime contracts, and verifies the integration end-to-end. Use when a project asks for "install gtsx" or "set up gtsx".
---

# Install gtsx In This Project

Install the smallest working gtsx integration for a TypeScript React project. This skill normally runs after a bootstrap prompt has installed the gtsx skills and routed the coding assistant here. Inspect project shape, preserve existing app behavior, and do not migrate components unless the user explicitly asked.

This file is the router. Read the detection profile first, then enter exactly one primary integration profile.

## Integration Profiles

1. Always start with [Project Detection](profiles/00-detect-project.md).
2. If the project is Vite React TypeScript, Vite React with React Router, or a Vite-compatible client SPA, use [Vite React](profiles/vite-react.md).
3. If the project is Next.js App Router, use [Next.js App Router](profiles/next-app-router.md).
4. If the project is client-only React but not Vite, use [Client Runtime](profiles/client-runtime.md) and adapt the generic contract to the host.
5. If the project owns server routes, SSR, static route generation, or islands, use [Server Runtime](profiles/server-runtime.md) and adapt the generic contract to the host.

## Global Rules

- Install packages from npm as `@gtsx/core`, `@gtsx/studio`, and the selected adapter package.
- Never add `@gtsx/preview-react` directly to the user project; it is adapter internals.
- Host preview code owns only framework wiring: search params, CSS/setup imports, providers/mocks, and adapter loading.
- Do not reimplement preview runtime in the app. No custom `GPreviewProvider`, boundary collectors, iframe `postMessage` handlers, resize observers, boundary rect readers, case override merging, or scope fallback logic.
- Keep existing app routes, config wrappers, router entrypoints, providers, and production behavior intact.
- Never write runtime props, scope, provider values, DOM rects, or serialized snapshots into public files.

## After Setup

Route to sibling skills for component work:

- `authoring-gtsx` — write new `.g.tsx` components and cases.
- `refactor-to-gtsx` — convert existing TSX components into `.g.tsx`.
