# CLI Lifecycle And Targets

Validate the Runelight CLI command surface, target discovery, capture behavior, and real development-server lifecycle in one temporary project or fixture. Use a realistic Host command chain rather than a single in-process mock; include one package-manager script path such as `pnpm dev`, one Host that launches a child or grandchild listener, and one listener that ignores graceful shutdown.

Validate these outcomes:

- `runelight --help` and command help expose the current public CLI surface for `check`, `inspect`, `preview-targets`, `containing-frames`, `changes`, `serve`, and `capture`, and do not advertise unimplemented commands.
- `runelight serve` starts the configured Host command, prints the local serve URL and base `/runelight` preview URL, does not print Studio or manifest URLs, and makes `/runelight/session` reachable with the expected project/session identity.
- Pressing terminal `Ctrl-C` for foreground `runelight serve` stops the Runelight CLI, package-manager wrapper, Host command, framework workers, and child or grandchild listener processes created for the test.
- After shutdown, `/runelight/session`, selected `/runelight?...` preview paths, the Host listening port, serve registry, and serve lock for that project are gone.
- Non-foreground Runelight-owned sessions such as `capture` terminate their full Host process tree before returning, including when the listening child outlives its parent or ignores graceful termination.
- Starting `runelight serve` again after shutdown reuses the requested port or chooses the expected next available Runelight-owned port without stale registry interference.
- When the underlying framework reports that another dev server is already running and prints a PID, Runelight preserves the framework message and adds guidance that lets a user identify the real process group or port owner.
- In the same real git worktree, `runelight changes --json --ui-only` inspects committed-versus-working-tree `.g.*` changes without starting a Host, browser, or serve session. Its JSON uses `schemaVersion: 1`, includes code/UI/frame status, respects exact `--component` filters for names, coordinates, file paths, and `file#export`, recalculates filtered summaries, scopes diagnostics to the requested surface, and exits non-zero only for fatal visible analyzer diagnostics.
- `runelight preview-targets <entry[#export]> --json` emits paged preview paths, reports page size and generated traversal size, includes `page.nextOffset` when another generated page is available, and its selected `target.path` can be passed directly to `runelight capture --path`.
- `runelight containing-frames <entry[#export]> --json` reverse-queries top-level frames that render a nested component and returns ready-to-capture `/runelight?...` paths whose `paths` data includes the requested component.
- With a foreground serve session running, `runelight capture` without `--port` attaches to that session, writes the requested screenshot, avoids starting a second Host command, avoids temporary-session startup noise, and leaves the foreground session running afterward.
- When `capture` must start a temporary preview server, it fails with actionable diagnostics if the Host cannot become ready and leaves no preview server running after success, failure, or interruption.

Clean up every temporary project, serve session directory, generated capture artifact, and dev-server process created for this test. Do not kill unrelated user processes that were already running before the test started.
