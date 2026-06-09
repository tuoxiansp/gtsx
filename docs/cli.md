# Runelight CLI

The `runelight` command ships in `@runelight/cli` (implemented in `@runelight/core`).

Requires `runelight.config.ts` with `host.command` for `serve` and `capture` (except `check` on files alone).

## Commands

### `runelight check`

Static analysis for `.g.tsx` and `.g.vue` protocol contracts.

```sh
runelight check src/Badge.g.tsx
runelight check src
runelight check -p tsconfig.app.json .
runelight check src --json
```

Exits non-zero on fatal diagnostics. See [Static Contract — Diagnostics](./runelight-static-contract.md#diagnostics).

### `runelight serve`

Starts the configured Host via `host.command`, sets `RUNELIGHT_DEV=1`, and prints Studio URLs.

```sh
runelight serve
runelight serve --port 4315
runelight serve -p tsconfig.app.json
```

Press `Ctrl-C` to stop the session. Foreground serve is reused by `runelight capture` when `--port` is omitted.

### `runelight capture`

Screenshots preview frames through the running or temporary dev server.

```sh
runelight capture src/Badge.g.tsx --frame neutral
runelight capture src/Badge.g.tsx --all
runelight capture src --all --out ./captures
runelight capture src/Panel.g.tsx --viewport 1440x900 --port 4315
runelight capture src/Panel.g.tsx --frame-override 'src/Child.g.tsx#default:admin'
# Preview URLs use repeatable query param frameOverride=coordinate:frameName
```

| Flag | Meaning |
|------|---------|
| `--frame <name>` | Single frame (default when entry has multiple frames) |
| `--all` | All frames; required for directory capture |
| `--out <path>` | Output PNG file or directory |
| `--viewport WxH` | Browser viewport (default `1440x900`) |
| `--port <n>` | Attach to existing serve session or start temporary server |
| `-p <tsconfig-or-dir>` | Project selection |

### `runelight init`

Scaffolds `runelight.config.ts` and optional npm scripts in the current project.

```sh
runelight init
runelight init --dry-run
```

Prefer [`setup-runelight`](../skills/setup-runelight/SKILL.md) for full Host integration.

### `runelight strip`

Removes Runelight integration artifacts (dry-run with `--check`).

```sh
runelight strip --check
runelight strip
```

### `runelight diagnose`

Prints project integration diagnostics (config, scope, adapter hints).

```sh
runelight diagnose
```

For integration issues, see [Troubleshooting](./troubleshooting.md).

## Environment

| Variable | Set by | Purpose |
|----------|--------|---------|
| `RUNELIGHT_DEV=1` | `runelight serve` | Enables adapter preview/studio routes in development |

## Related

- [Configuration](./runelight-config.md)
- [Troubleshooting](./troubleshooting.md)
