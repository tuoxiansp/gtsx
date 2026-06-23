# Runelight CLI

The `runelight` command ships in `@runelight/cli`. It wraps the project's own Host (Vite, Next.js, or a custom dev command) rather than running a parallel bundler.

Configuration lives in `runelight.config.ts`; see the [Configuration Reference](./runelight-configuration.md).

```sh
runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir] [--json]
runelight changes [-p <tsconfig-or-dir>] [--json] [--ui-only] [--component <component-or-file>]
runelight serve [-p <tsconfig-or-dir>] [--port <port>]
runelight capture [-p <tsconfig-or-dir>] <entry[#export]|dir> [--frame <name>] [--frame-override <entry#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
```

Command options are strict: unknown flags fail with `unknown-option`, known flags without required values fail with `missing-option-value`, and extra positional arguments fail with `unexpected-argument`. Host process output remains ordinary stderr.

## Project Selection

`check`, `changes`, `serve`, and `capture` accept `-p` / `--project` with either a tsconfig path or a directory. Project selection is an override chain, not a merge: an explicit `-p` wins, otherwise the CLI honors `project.tsconfig` from `runelight.config.ts`, otherwise it falls back to the nearest `tsconfig.json` from the working directory. If the nearest `tsconfig.json` is a project-reference container, pass or configure the app config that includes framework source, such as `tsconfig.app.json`.

## `runelight check`

Validates the `.g` protocol contract for the configured project, one entry, or a directory:

- With no target, checks the configured project: `project.sourceRoot` plus `${project.entryRoot}/design`.
- A file argument checks that entry; `#export` narrows to one exported component.
- A directory argument discovers and checks every entry supported by the configured `contracts`.
- Exits non-zero when any fatal diagnostic is reported. Warnings (such as `unmarked-provider-variant-projection`) do not fail the check.
- `--json` prints machine-readable results. Single-entry checks output that entry result directly; directory checks output `{ entries, diagnostics }`.

`runelight check` requires `contracts` in `runelight.config.ts`, such as `["@runelight/react/contract"]` or `["@runelight/vue/contract"]`. The CLI resolves those packages from the project root and delegates static analysis to the selected contract.

The complete diagnostic registry lives in [.g Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).

## `runelight changes`

Lists current Git workspace changes that affect Runelight frames or design drafts. The command compares the working tree against `HEAD`, builds the same static visual graph used by Studio changes, and does not start the Host or render screenshots.

The Studio changes tab is UI-focused and hides unchanged visual entries. The CLI default is audit-focused and includes code changes whose `uiStatus` is `"unchanged"`; pass `--ui-only` for a Studio-like visual change list.

- Added and deleted `.g.tsx` / `.g.vue` files are reported as added or deleted UI.
- Modified files distinguish `codeStatus` from `uiStatus`; code-only edits can be `uiStatus: "unchanged"`.
- Frame reports distinguish `added`, `deleted`, `changed`, `unchanged`, and `unknown`.
- `--json` prints a versioned automation schema with `schemaVersion: 1`.
- `--ui-only` omits components whose UI status is unchanged.
- `--component <component-or-file>` filters by exact component name, coordinate, file path, or `file#export`.
- When filters are present, `summary.files` and `summary.ui` describe the visible components; `base` and `diagnostics` still describe the full analysis context.

Fatal analyzer diagnostics are included in the report and make the command exit non-zero.

## `runelight serve`

Starts the configured Host through `host.command` from `runelight.config.ts`:

- Substitutes the `{port}` placeholder with the Runelight-owned port. Without `--port`, the supervisor starts at port 4300 and probes the next ports until it finds a free one. `--port` must be a TCP port from 1 to 65535.
- Sets `RUNELIGHT_DEV=1` so framework adapters activate the `/runelight` and `/runelight/studio` routes.
- Prints the local serve URL and Studio URL, and registers a serve session for the project so `runelight capture` can attach to it.
- `Ctrl-C` stops the Runelight CLI, the Host command, and the Host's worker children, then removes the session registry and lock.

Fails with `missing-host-command` when `host.command` is not configured, and `invalid-host-command` when the configured command does not include the `{port}` placeholder.

## `runelight capture`

Renders a preview to a PNG screenshot:

- Capture always requires an explicit entry or directory target; unlike `check`, it has no project-wide default.
- Omit `--frame` to capture all frames as a contact sheet. Pass `--frame <name>` to capture one frame.
- `--frame-override <entry#export:frame>` pins child component frames during capture; repeatable.
- `--viewport` defaults to `1440x900`. For a single frame, `--out` defaults to `runelight-capture.png`; a value ending in `.png` is used as the file path, while any other value is treated as a directory and receives `<entry>.<frame>.png`. For contact sheets and directory capture, `--out` defaults to the `runelight-captures` directory.
- With a foreground `runelight serve` already running for the same project, capture attaches to that session and leaves it running. Otherwise it starts a temporary Host from `host.command`, captures, and always stops the temporary Host afterwards.
