# Let the Serve Supervisor own the port

The **Runelight Serve Supervisor** owns the **Runelight Serve Port** for a **Runelight Serve Session**. It may accept an explicit `--port`, otherwise it chooses from a Runelight-owned default range. The wrapped **Host** must bind the chosen port; if the Host cannot bind it, the supervisor should choose another candidate or fail clearly rather than accepting silent Host port drift.

This differs from relying on Vite, Next.js, or another Host to apply its own default port and fallback behavior. Once users start their workspace with `runelight serve`, the visible local environment belongs to Runelight, and downstream commands such as `capture` depend on the same verified port and base URL.

The supervisor must verify the actual **Runelight Route Space** before publishing a registry record. Registry entries should describe the confirmed port, not the requested port. Host launch instructions should therefore prefer strict port flags where a Host supports them, such as Vite's strict port mode; when a Host lacks strict binding, the supervisor must rely on manifest health and session identity checks before considering the session attached.
