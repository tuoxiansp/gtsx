# Split Runelight CLI from core

Runelight will move the public `runelight` binary into a dedicated `@runelight/cli` package instead of continuing to publish it from `@runelight/core`. `@runelight/core` remains the source-level protocol, analysis, and configuration library, while `@runelight/cli` owns local process orchestration for Studio, capture, check, diagnostics, and host startup.
