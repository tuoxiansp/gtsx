# Use a Serve Session Registry

Runelight commands will discover active `runelight serve` processes through a local **Runelight Serve Session Registry** keyed by project identity. The registry may store process id, port, base URL, and start time, but commands such as `runelight capture` must validate the process and `/runelight/studio/manifest` before attaching; stale registry entries are hints to clean up, not trusted state.
