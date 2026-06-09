# Gate Runelight surfaces behind Dev Mode

Runelight adapters should not treat ordinary framework development as enough reason to expose Studio, preview routes, or preview-only transforms. `runelight serve` and related CLI commands enter **Runelight Dev Mode** by wrapping the configured **Host** command and passing `RUNELIGHT_DEV=1`; without that signal, the Host should behave like the normal app, with no Runelight route space or transform layer active.
