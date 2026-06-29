# CLI Serve Lifecycle

Validate that the Runelight CLI manages real development-server lifecycles reliably from a user terminal.

Use a temporary project or fixture that exercises a realistic Host command chain rather than a single in-process mock. The Host should serve `/runelight/session` and at least one `/runelight?...` preview path, and at least one scenario should launch a child process that owns the listening port while its parent exits or responds to shutdown independently. At least one foreground scenario must start Runelight through a package-manager script such as `pnpm dev`, not only through `pnpm exec runelight serve`.

Validate these outcomes:

- `runelight --help` and the relevant command help expose the current public CLI surface for `check`, `inspect`, `preview-targets`, `changes`, `serve`, and `capture`, and do not advertise commands that are not implemented.
- `runelight serve` starts the configured Host command, prints the local Runelight serve URL and base `/runelight` preview URL, does not print a Studio or manifest URL, and makes `/runelight/session` reachable with the expected project/session identity.
- Pressing `Ctrl-C` in the terminal exits foreground `runelight serve` with interrupt semantics and removes the active serve session registry and lock for that project.
- The package-manager script path behaves the same way: after starting a project script such as `pnpm dev`, sending terminal Ctrl-C stops the script, the Runelight CLI, the Host command, and framework worker children.
- Do not treat a check that only signals the direct Runelight child process as sufficient; validate terminal-process-group behavior, because package managers can change signal propagation.
- After `Ctrl-C`, `/runelight/session`, selected `/runelight?...` preview paths, and the Host listening port are no longer reachable.
- After `Ctrl-C`, no project Host processes remain for the tested project, including package-manager wrappers, `tsx`/Node server processes, Next/Vite workers, or other child processes that were created only for this test.
- If the Host has a child or grandchild process that keeps the port open after the parent handles shutdown, non-foreground Runelight-owned sessions such as capture still terminate the full Host process tree or process group before returning control.
- If the listening process ignores graceful termination, `runelight serve` escalates enough that the user does not see a stopped terminal with a still-live preview server behind it.
- Starting `runelight serve` again after shutdown reuses the requested port or selects the expected next available Runelight-owned port without being blocked by a stale registry file.
- When the underlying framework reports that another dev server is already running and prints a PID, Runelight's error output preserves the framework message and adds reliable guidance to inspect or stop the whole process group or the actual port owner.
- A user following the printed guidance can identify the real listener even when the reported PID is only one process in a package-manager or framework launch chain.
- In the same real git worktree, `runelight changes --json --ui-only` can inspect committed-versus-working-tree `.g.*` changes without starting a Host command, attaching to a foreground serve session, opening a browser, or leaving any server process behind. Its JSON output should use `schemaVersion: 1`, include code status, UI status, and frame status, respect exact `--component` filters for component names, coordinates, file paths, and `file#export`, recalculate summaries for visible filtered components, scope `--component` diagnostics to the requested surface, and exit non-zero only for fatal analyzer diagnostics that remain visible after filtering.
- `runelight preview-targets --json` emits paged preview paths by default, reports the current page size in `page.currentPageSize`, reports the generated traversal size in `traversal.generatedTargets`, includes `page.nextOffset` when another generated page is available, and a selected `/runelight?...` path can be passed directly to `runelight capture --path` without decomposing it into frame flags.
- With a foreground `runelight serve` running for the current project, `runelight capture` without `--port` attaches to that serve session by default. It should generate the requested screenshot, avoid starting a second Host command, avoid printing temporary-session startup text, and leave the foreground serve session running afterward.
- `runelight capture` uses the same serve lifecycle behavior when it has to start a temporary preview server: it should fail with actionable diagnostics when the Host cannot become ready, and it should not leave a preview server running after success, failure, or interruption.

Clean up every temporary project, serve session directory, generated capture artifact, and dev-server process created for this test. Do not kill unrelated user processes that were already running before the test started.
