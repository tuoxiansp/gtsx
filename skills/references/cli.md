# Runelight CLI Reference

This file is packaged with `@runelight/skills` for agents working from an installed project. Prefer this local package reference over remote docs when a skill needs CLI details.

## Commands

### `runelight check [entry[#export]|dir] [--json]`

Validates the configured `.g` protocol contract for one entry, one directory, or the configured project. It performs static analysis; it does not start the Host, open a browser, or capture screenshots.

Reach for it when frames, branch expressions, scope seams, provider variants, setup wiring, or migrations have changed and you need to know whether the protocol contract still holds.

### `runelight inspect <entry[#export]> --json`

Builds the static GUI dependency map for one Runelight component entry. It reports reachable `.g` component nodes, frame dependencies, structural dependencies, and conservative pruning evidence. It does not start the Host or render UI.

Reach for it when you need to understand composition before choosing an observation root, or when a parent/child relationship is not obvious from imports alone.

### `runelight containing-frames <entry[#export]> --json`

Reverse-searches the project index for top-level covered frames that can render a target component. It emits ready-to-open `/runelight?...` paths from the containing root when such context exists.

Reach for it before visually judging a leaf or nested component, because parent layout, density, theme, siblings, and container width often determine the real polish problem.

### `runelight preview-targets <entry[#export]> --json`

Generates browser-ready `/runelight?...` preview paths from a chosen observation root. Each target includes path nodes with coordinates, frame names, and frame descriptions when declared. It does not start the Host.

Reach for it after selecting the app, screen, parent, or component entry you want to observe.

### `runelight changes [--json] [--ui-only] [--component <component-or-file>]`

Compares the current Git workspace against `HEAD` and reports Runelight UI/frame changes without starting the Host. `--ui-only` filters out code changes that do not affect declared UI frames.

Reach for it when several local edits exist, the user asks what visual surfaces changed, or you need to pick a focused verification target.

### `runelight serve [--port <port>]`

Starts the configured `host.command`, sets `RUNELIGHT_DEV=1`, waits for `/runelight/session`, and prints the local `/runelight` preview base URL. This gives you an interactive preview session backed by the user's real Host.

Reach for it when you need to open previews in a browser or keep a Host session alive while inspecting multiple paths.

### `runelight capture --path "<target.path>"`

Renders a preview path to a PNG screenshot. When a matching `runelight serve` session is already running, capture attaches to it; otherwise it can start a temporary Host from `host.command` and stop it afterward.

Reach for it when you need screenshot evidence for a selected state, a before/after comparison, or a non-interactive verification artifact.

### `runelight capture <entry[#export]> [--frame <name>]`

Captures one frame or, when `--frame` is omitted, a contact sheet of all frames for an entry.

Reach for it when isolated frame coverage is the subject, or when you need a quick contact sheet for newly authored frames.

## Common Options

```sh
runelight check [entry[#export]|dir] [--json]
runelight inspect <entry[#export]> --json
runelight containing-frames <entry[#export]> --json
runelight preview-targets <entry[#export]> --json
runelight changes --json --ui-only
runelight serve [--port <port>]
runelight capture --path "<target.path>" [--viewport 1440x900]
runelight capture <entry[#export]> [--frame <name>]
```

All commands accept `-p` / `--project` with a tsconfig path or project directory when the nearest `tsconfig.json` is not the app config.

## Workflow Prompts

- Setup verification: `check` -> `serve` -> `preview-targets` for one entry -> open or `capture`.
- Authoring/refactor verification: `check` -> `containing-frames` or `inspect` -> `preview-targets` -> `capture`.
- Polish observation: `changes --ui-only` when needed -> `containing-frames` -> `preview-targets` -> open or `capture`.
- Final confidence: rerun `check`, then typecheck/build when ordinary app code can be affected.
