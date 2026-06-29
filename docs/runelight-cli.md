# Runelight CLI

The `runelight` command ships in `@runelight/cli`. It wraps the project's own React or Vue Host dev command rather than running a parallel bundler.

Configuration lives in `runelight.config.ts`; see the [Configuration Reference](./runelight-configuration.md).

```sh
runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir] [--json]
runelight inspect [-p <tsconfig-or-dir>] <entry[#export]> [--json]
runelight preview-targets [-p <tsconfig-or-dir>] <entry[#export]> [--json] [--walk breadth-first|depth-first] [--max-depth <n>] [--max-targets <n>] [--limit <n>] [--offset <n>]
runelight changes [-p <tsconfig-or-dir>] [--json] [--ui-only] [--component <component-or-file>]
runelight serve [-p <tsconfig-or-dir>] [--port <port>]
runelight capture [-p <tsconfig-or-dir>] <entry[#export]|dir> [--frame <name>] [--frame-override <entry#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
runelight capture [-p <tsconfig-or-dir>] --path </runelight?...> [--viewport 1440x900] [--out <file.png>] [--port <port>]
```

Command options are strict: unknown flags fail with `unknown-option`, known flags without required values fail with `missing-option-value`, and extra positional arguments fail with `unexpected-argument`. Host process output remains ordinary stderr.

## Project Selection

`check`, `inspect`, `preview-targets`, `changes`, `serve`, and `capture` accept `-p` / `--project` with either a tsconfig path or a directory. Project selection is an override chain, not a merge: an explicit `-p` wins, otherwise the CLI honors `project.tsconfig` from `runelight.config.ts`, otherwise it falls back to the nearest `tsconfig.json` from the working directory. If the nearest `tsconfig.json` is a project-reference container, pass or configure the app config that includes framework source, such as `tsconfig.app.json`.

## `runelight check`

Validates the `.g` protocol contract for the configured project, one entry, or a directory:

- With no target, checks the configured project scope.
- A file argument checks that entry; `#export` narrows to one exported component.
- A directory argument discovers and checks every entry supported by the configured `contracts`.
- Exits non-zero when any fatal diagnostic is reported. Warnings (such as `unmarked-provider-variant-projection`) do not fail the check.
- `--json` prints machine-readable results. Single-entry checks output that entry result directly; directory checks output `{ entries, diagnostics }`.

`runelight check` requires `contracts` in `runelight.config.ts`, such as `["@runelight/react/contract"]` or `["@runelight/vue/contract"]`. The CLI resolves those packages from the project root and delegates static analysis to the selected contract.

The complete diagnostic registry lives in [.g Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).

## `runelight inspect`

Builds a static GUI dependency map for one Runelight component entry:

- Accepts an entry file or explicit coordinate such as `src/AppShell.g.tsx#default`.
- If a file contains multiple Runelight component exports, pass an explicit coordinate.
- Does not start the Host, open a browser, render screenshots, or expand dependency combinations.
- Outputs each reachable component node and, for every frame, the `.g` component coordinates that can contribute GUI under conservative static analysis.
- Keeps the unpruned structural graph in `structuralDependencies`; when a dependency is removed from `dependencies`, `prunedDependencies` records the coordinate and proof reason.
- `--json` prints a versioned automation schema with `schemaVersion: 1`.

`inspect` is conservative. It may remove a GUI dependency only when it can prove the child contributes no rendered UI for that parent frame, such as a parent frame passing an empty prop into a child that immediately returns `null` for that value. If the analyzer cannot prove the branch is empty, it keeps the dependency.

## `runelight preview-targets`

Builds browser-ready preview paths from the pruned static GUI graph for one Runelight component entry:

- Accepts an entry file or explicit coordinate such as `src/AppShell.g.tsx#default`.
- Does not start the Host, open a browser, or render screenshots.
- Emits `/runelight?...` paths without a host. Attach them to the local Host returned by `runelight serve` or an already-running app server.
- Each target contains a `path` and one or more static `paths`. A path node contains `coordinate`, `frame`, and static `description` when the frame declares one.
- Traversal uses the same conservative pruning as `inspect`. Pruned dependencies do not generate ordinary preview targets.
- Cycle detection is always enabled per path. A cyclic child is recorded with `cycle: true` and `cyclePath`, and that branch is not expanded further.
- `--walk` is optional and defaults to `breadth-first`; `depth-first` is also supported.
- `--max-depth` is optional and defaults to no depth limit. Depth is counted from the root frame, so `--max-depth 0` lists only root frames.
- `--max-targets` is optional and defaults to `1000`; when the limit is hit, `traversal.truncated` is `true`.
- Output is paginated by default. `--limit` defaults to `20`, `--offset` defaults to `0`, `page.currentPageSize` reports this page's count, and `page.nextOffset` is present when another generated page is available.
- JSON output reports `traversal.generatedTargets`, the number of targets generated under the current `--max-targets` protection. When `traversal.truncated` is `true`, this is not a complete total; raise `--max-targets` only when the caller really needs a larger traversal.
- `--json` prints a versioned automation schema with `schemaVersion: 1`.

`preview-targets` intentionally does not score or rank targets. The output order is only the requested traversal order over the fixed pruned tree. Agents should use `paths` and frame descriptions to decide what to open first.

## `runelight changes`

Lists current Git workspace changes that affect Runelight frames. The command compares the working tree against `HEAD`, builds the same static visual graph used by `preview-targets` and capture workflows, and does not start the Host or render screenshots.

The CLI default is audit-focused and includes code changes whose `uiStatus` is `"unchanged"`; pass `--ui-only` for a visual-only change list.

- Added and deleted `.g.tsx` / `.g.vue` files are reported as added or deleted UI.
- Modified files distinguish `codeStatus` from `uiStatus`; code-only edits can be `uiStatus: "unchanged"`.
- Frame reports distinguish `added`, `deleted`, `changed`, `unchanged`, and `unknown`.
- `--json` prints a versioned automation schema with `schemaVersion: 1`.
- `--ui-only` omits components whose UI status is unchanged.
- `--component <component-or-file>` filters by exact component name, coordinate, file path, or `file#export`.
- When filters are present, `summary.files` and `summary.ui` describe the visible components.
- With `--component`, diagnostics are scoped to the matching or requested component file so unrelated analyzer errors do not block single-surface discovery. Fileless project diagnostics are still included.

Visible fatal analyzer diagnostics make the command exit non-zero.

## `runelight serve`

Starts the configured Host through `host.command` from `runelight.config.ts`:

- Substitutes the `{port}` placeholder with the Runelight-owned port. Without `--port`, the supervisor starts at port 4300 and probes the next ports until it finds a free one. `--port` must be a TCP port from 1 to 65535.
- Sets `RUNELIGHT_DEV=1` so framework adapters activate `/runelight` and `/runelight/session`.
- Prints the local serve URL and the base `/runelight` preview URL, waits for the session endpoint, and registers a serve session for the project so `runelight capture` can attach to it.
- `Ctrl-C` stops the Runelight CLI, the Host command, and the Host's worker children, then removes the session registry and lock.

Fails with `missing-host-command` when `host.command` is not configured, and `invalid-host-command` when the configured command does not include the `{port}` placeholder.

## `runelight capture`

Renders a preview to a PNG screenshot:

- Capture always requires an explicit entry, directory target, or preview path; unlike `check`, it has no project-wide default.
- Omit `--frame` to capture all frames as a contact sheet. Pass `--frame <name>` to capture one frame.
- `--frame-override <entry#export:frame>` pins child component frames during capture; repeatable.
- `--path </runelight?...>` captures a preview path produced by `preview-targets` directly. Do not pass `--frame` or `--frame-override` with `--path`; encode preview selection in the path instead. `--path` output is a single PNG, so `--out` must be a `.png` file path.
- `--viewport` defaults to `1440x900`. For a single frame, `--out` defaults to `runelight-capture.png`; a value ending in `.png` is used as the file path, while any other value is treated as a directory and receives `<entry>.<frame>.png`. For contact sheets and directory capture, `--out` defaults to the `runelight-captures` directory.
- With a foreground `runelight serve` already running for the same project, capture attaches to that session and leaves it running. Otherwise it starts a temporary Host from `host.command`, captures, and always stops the temporary Host afterwards.
