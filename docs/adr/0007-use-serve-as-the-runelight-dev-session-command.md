# Use serve as the Runelight dev session command

Runelight will use `runelight serve` as the primary command for starting a local **Runelight Serve Session**. Studio and capture are capabilities of that served Runelight dev environment, so `serve` better names the wrapper's job than `studio`: it starts the Host in **Runelight Dev Mode**, exposes the conventional **Runelight Route Space**, and gives downstream commands a running environment to target.

`runelight serve` is a foreground **Runelight Serve Supervisor**, not a background launcher. After the Host is ready, the CLI process remains alive, streams Host output, owns shutdown, and keeps the **Runelight Serve Session Registry** accurate for the lifetime of the session. If the Host exits, the supervisor exits with an appropriate status; if the supervisor receives a termination signal, it should stop the Host and remove the session record when possible.

This follows the normal quality expectation for developer CLIs: one visible foreground process owns the dev environment, logs remain attached to the terminal, interrupts behave predictably, and background state is only a discoverability aid rather than the source of truth.
