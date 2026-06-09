# Use conventional Runelight route space

Runelight will reserve the `/runelight` route space for local Studio, manifest, and preview rendering instead of exposing custom Studio and preview URL templates in project config. This keeps the CLI configuration focused on how to start the **Host** while `runelight serve` and `runelight capture` derive their URLs from the conventional **Runelight Route Space**.
