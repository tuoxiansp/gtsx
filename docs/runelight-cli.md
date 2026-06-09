# Runelight CLI

The `runelight` command ships in `@runelight/cli`. It wraps the project's own Host (Vite, Next.js, or a custom dev command) rather than running a parallel bundler.

Configuration lives in `runelight.config.ts`; see the [Configuration Reference](./runelight-configuration.md).

```sh
runelight init [--dry-run]
runelight check [-p <tsconfig-or-dir>] <entry.g.tsx|entry.g.vue[#export]|dir> [--json]
runelight serve [-p <tsconfig-or-dir>] [--port <port>]
runelight capture [-p <tsconfig-or-dir>] <entry.g.tsx|entry.g.vue[#export]|dir> [--frame <name>|--all] [--frame-override <entry#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
runelight strip [--check]
```

## Project Selection

`check`, `serve`, and `capture` accept `-p` / `--project` with either a tsconfig path or a directory. Without it, the CLI uses the nearest `tsconfig.json` from the working directory. If the nearest `tsconfig.json` is a project-reference container, pass the app config that includes framework source, such as `tsconfig.app.json`.

## `runelight init`

Bootstraps the smallest Runelight integration in the current directory:

- Writes `runelight.config.ts` from a template if it does not exist.
- Writes an `AGENTS.md` with Runelight project instructions if it does not exist.
- Merges `package.json` scripts: `dev` (defaults to `runelight serve`), `runelight:check`, and `runelight:capture`. Existing scripts are preserved.

`--dry-run` prints the plan without writing anything. `init` does not install packages or wire framework adapters; for full setup use the [`setup-runelight`](../skills/setup-runelight/SKILL.md) agent skill.

## `runelight check`

Validates the `.g` protocol contract for one entry or a directory:

- A file argument checks that entry; `#export` narrows to one exported component.
- A directory argument discovers and checks every `.g.tsx` / `.g.vue` entry inside it.
- Exits non-zero when any fatal diagnostic is reported. Warnings (such as `unmarked-provider-variant-projection`) do not fail the check.
- `--json` prints machine-readable results for a single entry. Directory JSON output is not supported yet.

The complete diagnostic registry lives in [.g Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).

## `runelight serve`

Starts the configured Host through `host.command` from `runelight.config.ts`:

- Substitutes the `{port}` placeholder with the Runelight-owned port. Without `--port`, the supervisor starts at port 4300 and probes the next ports until it finds a free one.
- Sets `RUNELIGHT_DEV=1` so framework adapters activate the `/runelight` and `/runelight/studio` routes.
- Prints the local serve URL and Studio URL, and registers a serve session for the project so `runelight capture` can attach to it.
- `Ctrl-C` stops the Runelight CLI, the Host command, and the Host's worker children, then removes the session registry and lock.

Fails with `missing-host-command` when `host.command` is not configured.

## `runelight capture`

Renders a preview to a PNG screenshot:

- `--frame <name>` captures one frame (defaults to the first declared frame); `--all` captures a contact sheet of all frames. Directory capture requires `--all`.
- `--frame-override <entry#export:frame>` pins child component frames during capture; repeatable.
- `--viewport` defaults to `1440x900`; `--out` defaults to `runelight-capture.png` (a directory when capturing multiple entries).
- With a foreground `runelight serve` already running for the same project, capture attaches to that session and leaves it running. Otherwise it starts a temporary Host from `host.command`, captures, and always stops the temporary Host afterwards.

## `runelight strip`

Reserved for stripping preview metadata from production output. No strip integration is currently configurable; the command reports `missing-strip-script` as an advisory and exits 0 (also with `--check`).
