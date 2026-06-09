# Use RUNELIGHT_DEV as the Dev Mode flag

Runelight will use `RUNELIGHT_DEV=1` as the explicit environment signal for **Runelight Dev Mode**. The CLI injects this variable when wrapping the configured **Host** command, and adapters use it to decide whether to register the **Runelight Route Space** and preview transforms instead of inferring Runelight behavior from `NODE_ENV`.
