# Capture attaches or starts a temporary serve session

`runelight capture` will first attach to a healthy **Runelight Serve Session** from the **Runelight Serve Session Registry**. If no healthy session exists, it will start a temporary Runelight serve session, run the capture, and stop that session afterward; this keeps one-off captures and CI simple while preserving fast reuse when `runelight serve` is already running.

A temporary capture-owned session should not be published into the shared **Runelight Serve Session Registry** by default. Its lifecycle belongs to the capture command, and publishing it would allow other commands to attach to an environment that may disappear as soon as capture completes. Public registry records are reserved for foreground `runelight serve` sessions or future explicitly keep-alive workflows.

This keeps ownership simple: capture may reuse an existing verified foreground session, or it may create a private temporary Host process and tear down only what it created.
