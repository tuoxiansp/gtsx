# Rename preview config to Host launch instructions

Runelight will rename the launch-related `preview.*` configuration into Host-oriented language. The configuration exists to tell `runelight serve` and `runelight capture` which underlying **Host** command to wrap, so `host.command` fits the new CLI mental model better than `preview.serve`; project scripts should call Runelight, and Runelight should call the Host command.
