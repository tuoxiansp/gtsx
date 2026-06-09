# Use a Serve Session Registry

Runelight commands will discover active `runelight serve` processes through a local **Runelight Serve Session Registry** keyed by project identity. The registry may store process id, port, base URL, and start time, but commands such as `runelight capture` must validate the process and `/runelight/studio/manifest` before attaching; stale registry entries are hints to clean up, not trusted state.

The registry is a discoverability mechanism, not an authority. An attaching command must treat registry contents as untrusted until it verifies that the process is alive, the project identity matches, and the conventional **Runelight Route Space** responds with a healthy manifest. Explicit ports should follow the same rule: a healthy URL alone is insufficient if it cannot be tied back to the current project/session.

Registry writes should be robust against partial files, and cleanup should be ownership-aware. A command should remove stale records it can prove invalid, but should not blindly remove a live session record it does not own.
