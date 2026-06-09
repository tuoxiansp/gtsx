# Use project-declared Host launch instructions

`runelight serve` will not depend on built-in framework autodetection as its core launch strategy. The **Runelight-Owned Launch Layer** gives users a Runelight-first command and process coordinator, while the project remains the source of truth for how its **Host** starts; this avoids turning the CLI into a growing compatibility matrix for every Vite, Next.js, package manager, and workspace variation.
