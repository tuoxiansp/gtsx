# Runelight

**Let agents polish your UI with eyes.**

[runelight.ai](https://runelight.ai)

Runelight is a visual feedback loop for AI coding agents working on frontend UI.

When you ask an agent to improve a screen, it should be able to preview what exists, sync with you on the intended change, edit the source, capture the updated UI, and check the outcome. Runelight brings that loop into the project the agent is already editing.

```text
preview current UI -> sync on intended change -> edit code -> capture updated UI -> check outcome
```

See it. Polish it. Prove it.

## Why Runelight

AI agents can change frontend code. The harder part is visual judgment.

When you ask for polish, the agent needs to answer practical questions before it edits:

- What does the screen look like right now?
- Where does this component sit in the real page or panel?
- Which change are we actually trying first?
- Did the updated UI look better after the edit?
- Did important loading, empty, error, role, or dense-data views still hold up?

Without visual feedback, the agent is guessing. With Runelight, the agent can work through a visible loop and show you what changed.

## What You Get

**A preview loop inside your project.**
The agent can open the relevant UI, inspect it in context, edit the source, and return to the same surface after the change.

**A sync point before subjective edits.**
For polish, the agent observes first, tells you what it intends to change, and waits before it starts editing.

**A capture-backed result.**
After the edit, the agent captures the updated UI and reports the outcome instead of only saying the code changed.

**Coverage that grows with your app.**
Runelight gives important UI surfaces named places to preview, so future agents can find them again.

## How You Use It

Install Runelight once in your project. Paste this into your AI agent:

```text
Install or upgrade Runelight in this project.

Read the latest Runelight setup playbook:
https://github.com/tuoxiansp/runelight/blob/main/installer/runelight-setup.md

Follow that playbook in this repository.

Detect the framework, install or upgrade the compatible @runelight packages,
wire the preview integration, refresh the matching authoring/refactor/polish
skills, and verify the setup.

Use real UI surfaces. Do not create placeholder coverage or draft artifacts.
```

Then use the installed skills in this order:

```text
/refactor-to-runelight-react
Convert the settings panel into Runelight coverage.
Use real UI from this project, then verify the preview works.
```

For Vue projects, use the Vue refactor skill instead:

```text
/refactor-to-runelight-vue
Convert the settings panel into Runelight coverage.
Use real UI from this project, then verify the preview works.
```

Once the UI is covered, use the polish loop:

```text
/polish
Polish the Runelight-covered settings panel.
Preview it first, sync on the intended change before editing,
then capture the result and tell me what changed.
```

The order matters: refactor first, polish second. Refactor gives the agent a stable visual surface to preview. Polish uses that surface to observe, sync, edit, capture, and report.

## What Runelight Does

Runelight stays close to your existing app. It does not replace your framework, routes, design system, data layer, or production render path.

In your project, Runelight:

- installs the packages needed for your framework;
- wires a development preview that the agent can open and capture;
- adds project-level skills such as `/refactor-to-runelight-react`, `/refactor-to-runelight-vue`, and `/polish`;
- uses the `.g` protocol to mark important UI surfaces beside the source, so agents can find and revisit them;
- gives the agent commands to verify setup, discover previews, and capture results.

Runelight preview is for development by default. Installing it should not publish a public Runelight preview in your deployed app.

## Supported Projects

Runelight currently supports TypeScript React and Vue 3 projects.

Validated setup paths:

- Vite React
- Next.js App Router
- Vite Vue
- custom TypeScript React hosts that can expose the same development preview contract

Unsupported by default: JavaScript-only projects, non-React/Vue frameworks, unsupported framework hosts, or projects without a selectable TypeScript Program.

Runelight is pre-release software. The packages are still `0.0.x`, and breaking changes are allowed while the protocol, adapters, setup playbook, skills, examples, and tests move together.

## Technical Summary

Runelight is built on the [`.g` protocol](docs/g-protocol.md).

- React uses `.g.tsx`: a normal React component with static `frames`.
- Vue uses `.g.vue`: a normal Vue SFC with a `<g:frames>` block.
- `runelight check` validates that declared frames stay aligned with source.
- `runelight preview-targets`, `runelight containing-frames`, `runelight serve`, and `runelight capture` give agents the preview/capture loop.
- Framework adapters expose development-only `/runelight` and `/runelight/session` routes.

For the full architecture, see [Design](docs/runelight-design.md), [Static Contract](docs/runelight-static-contract.md), and [CLI Reference](docs/runelight-cli.md).

## Leave Anytime

Runelight coverage is additive.

For React, remove `Component.frames`, unwrap any Runelight seam helper back to the real hook, rename `.g.tsx` to `.tsx`, and remove the adapter glue.

For Vue, delete the `<g:frames>` block, replace Runelight injection helpers where used, rename `.g.vue` to `.vue`, and remove the Vite adapter glue.

What remains is ordinary React or Vue code.

## Docs

**Using Runelight**

- [React Authoring Guide](docs/runelight-authoring-guide.md)
- [Vue Authoring Guide](docs/runelight-vue-authoring-guide.md)
- [React Refactor Guide](docs/runelight-refactor-guide.md)
- [Vue Refactor Guide](docs/runelight-vue-refactor-guide.md)
- [Configuration Reference](docs/runelight-configuration.md)

**For AI agents**

- [Setup Playbook](installer/runelight-setup.md)
- [Skills](skills/)
- [Intelligence Tests](intelligence-tests/)

## Development

This repository is a pnpm workspace:

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

The product website lives in [apps/website](apps/website/). Examples live under [examples](examples/), including React Vite and Vue Vite fixtures.
