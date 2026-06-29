# Runelight Setup Playbook

Use this floating playbook to install, upgrade, or repair Runelight in a user project. This replaces the old flow where the agent first installed a project-local `setup-runelight` skill.

The playbook itself may be read from the latest Runelight repository. Do not copy this playbook into `.agents/skills`, and do not install `setup-runelight` as a project-level skill. Project-level skills are only the ongoing authoring/refactor/polish workflows selected for the detected framework.

## Start

1. Confirm the user wants Runelight setup or upgrade in the current project.
2. Inspect the project before editing:
   - package manager and lockfile;
   - framework and TypeScript setup;
   - existing `@runelight/*` packages;
   - existing `runelight.config.*`;
   - existing `/runelight` preview/session glue;
   - existing `.agents/skills` entries.
3. Preserve host behavior. Do not replace routes, router entrypoints, package-manager scripts, framework config wrappers, app providers, or production behavior unless verification shows the existing Runelight glue is incompatible.
4. Do not create sample `.g.tsx`, `.g.vue`, placeholder frames, design roots, screenshots, serialized DOM, or hand-authored files under `.runelight`.

## Choose The Profile

Use exactly one primary setup profile:

| Project shape | Setup profile |
| --- | --- |
| Vite React TypeScript, React Router on Vite, or Vite-compatible TypeScript client SPA | `skills/setup-runelight/profiles/vite-react.md` |
| Vite Vue 3 TypeScript | `skills/setup-runelight/profiles/vite-vue.md` |
| Next.js App Router TypeScript | `skills/setup-runelight/profiles/next-app-router.md` |
| Client-only TypeScript React with a custom host | `skills/setup-runelight/profiles/client-runtime.md` |
| TypeScript React with server routes, SSR, static route generation, or islands | `skills/setup-runelight/profiles/server-runtime.md` |

Read `skills/setup-runelight/profiles/00-detect-project.md` first, then the selected profile. Treat those files as setup reference material, not as a skill to install.

Unsupported projects: JavaScript-only projects, unsupported framework hosts, projects without a selectable TypeScript Program, or non-React/Vue frameworks.

## Install Packages

Use the project's package manager. Keep Runelight packages as a compatibility group.

For React:

- `@runelight/core`
- `@runelight/react`
- the selected adapter package, such as `@runelight/adapter-vite-react` or `@runelight/adapter-next-react`
- `@runelight/cli`

For Vue:

- `@runelight/core`
- `@runelight/vue`
- `@runelight/adapter-vite-vue`
- `@runelight/cli`

For local checkout or intelligence-test runs, wire package dependencies to the checkout as the test requires. For normal user projects, install from npm.

Do not install deprecated or removed packages such as `@runelight/studio`, `@runelight/changes`, legacy preview packages, or removed adapter subpaths.

## Configure Runelight

Create or update the smallest working integration:

- `runelight.config.ts` with `project.sourceRoot`, `project.entryRoot`, optional stable `project.namespace`, and a `host.command` containing `{port}`;
- adapter wrapper in Vite or Next config, preserving existing config composition;
- development-only preview branch or route for `/runelight`;
- `/runelight/session` served by the adapter or framework route helper;
- generated files under `${project.entryRoot}/.runelight/`;
- `.gitignore` containing `.runelight/`.

The preview route must recreate the visual environment through CSS/static imports and static wrapper DOM when needed. Do not wrap preview in hookful production layouts, auth/session clients, routers, data fetchers, or provider shells that execute application behavior.

## Install Project Skills

Install or refresh only the companion skills needed by the detected framework as project-level skills.

| Project type | Project-level skills |
| --- | --- |
| React | `authoring-runelight-react`, `refactor-to-runelight-react`, `polish` |
| Vue | `authoring-runelight-vue`, `refactor-to-runelight-vue`, `polish` |

Copy these skill directories into `.agents/skills/` from the Runelight skill source that matches this setup run. In repository and intelligence-test flows, that source is this checkout's `skills/` directory. In packaged installs, use the installed Runelight skill bundle when available. Do not install irrelevant framework companion skills, deprecated unsplit skills, or the setup playbook itself.

If a companion skill is already present, refresh it before relying on it. Report the source used for the refresh.

## Upgrade / Ensure Mode

If existing Runelight integration is present, run an audit before rewriting glue:

- inspect installed and target package versions;
- inspect adapter exports, local examples, type errors, and current route/config shape;
- update packages as a compatibility group when upgrade is requested;
- migrate only glue proven incompatible by typecheck, adapter contract, or runtime verification;
- preserve local preview CSS, route isolation, providers, wrapper elements, and host commands unless they directly conflict with the current contract.

Report: packages changed, skills refreshed, glue unchanged or migrated, files changed, and the concrete reason for every glue edit.

## Verify

Run the smallest concrete verification that proves setup:

- package manager install completed and lockfile updated;
- project typecheck or targeted framework check;
- `runelight check` for existing `.g.tsx` / `.g.vue` entries, or directory check when coverage exists;
- `runelight serve`;
- `/runelight/session` returns matching serve-session JSON;
- at least one `/runelight?entry=...&frame=...` preview path renders when entries exist;
- original app route still renders;
- production build remains unexposed by default: no usable `/runelight`, no usable `/runelight/session`, no preview code required in production, and no generated `.runelight` writes required by production.

If no `.g` coverage exists yet, report setup success and recommend the installed authoring or refactor skill as the next step. Do not create placeholder coverage during setup.

## Final Report

Keep the final report concrete:

- detected framework and selected setup profile;
- packages installed or upgraded;
- project skills installed or refreshed;
- Runelight config and adapter glue changed;
- verification commands and results;
- any skipped verification and why;
- next step for authoring/refactor/polish.
