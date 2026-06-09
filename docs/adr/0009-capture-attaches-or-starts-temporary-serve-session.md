# Capture attaches or starts a temporary serve session

`runelight capture` will first attach to a healthy **Runelight Serve Session** from the **Runelight Serve Session Registry**. If no healthy session exists, it will start a temporary Runelight serve session, run the capture, and stop that session afterward; this keeps one-off captures and CI simple while preserving fast reuse when `runelight serve` is already running.
