# CLI Serve Lifecycle

Validate that the Runelight CLI manages real development-server lifecycles reliably from a user terminal.

Use a temporary project or fixture that exercises a realistic Host command chain rather than a single in-process mock. The Host should serve `/runelight/studio` and `/runelight/studio/manifest`, and at least one scenario should launch a child process that owns the listening port while its parent exits or responds to shutdown independently. At least one foreground scenario must start Runelight through a package-manager script such as `pnpm dev`, not only through `pnpm exec runelight serve`.

Validate these outcomes:

- `runelight --help` and the relevant command help expose the current public CLI surface for `check`, `serve`, and `capture`.
- `runelight serve` starts the configured Host command, prints the local Runelight serve URL and Studio URL, and makes `/runelight/studio/manifest` reachable with the expected project/session identity.
- Studio is usable from the printed URL, and interacting with Studio does not depend on hidden terminal state after startup.
- Pressing `Ctrl-C` in the terminal exits foreground `runelight serve` with interrupt semantics and removes the active serve session registry and lock for that project.
- The package-manager script path behaves the same way: after starting a project script such as `pnpm dev`, sending terminal Ctrl-C stops the script, the Runelight CLI, the Host command, and framework worker children.
- Do not treat a check that only signals the direct Runelight child process as sufficient; validate terminal-process-group behavior, because package managers can change signal propagation.
- After `Ctrl-C`, `/runelight/studio`, `/runelight/studio/manifest`, and the Host listening port are no longer reachable.
- After `Ctrl-C`, no project Host processes remain for the tested project, including package-manager wrappers, `tsx`/Node server processes, Next/Vite workers, or other child processes that were created only for this test.
- If the Host has a child or grandchild process that keeps the port open after the parent handles shutdown, non-foreground Runelight-owned sessions such as capture still terminate the full Host process tree or process group before returning control.
- If the listening process ignores graceful termination, `runelight serve` escalates enough that the user does not see a stopped terminal with a still-live Studio behind it.
- After shutdown, interacting with any previously opened Studio tab cannot revive terminal output from the stopped `runelight serve` command.
- Starting `runelight serve` again after shutdown reuses the requested port or selects the expected next available Runelight-owned port without being blocked by a stale registry file.
- When the underlying framework reports that another dev server is already running and prints a PID, Runelight's error output preserves the framework message and adds reliable guidance to inspect or stop the whole process group or the actual port owner.
- A user following the printed guidance can identify the real listener even when the reported PID is only one process in a package-manager or framework launch chain.
- `runelight capture` uses the same serve lifecycle behavior when it has to start a temporary preview server: it should fail with actionable diagnostics when the Host cannot become ready, and it should not leave a preview server running after success, failure, or interruption.

Clean up every temporary project, serve session directory, generated capture artifact, and dev-server process created for this test. Do not kill unrelated user processes that were already running before the test started.
