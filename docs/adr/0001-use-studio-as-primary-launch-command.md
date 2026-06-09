---
status: superseded by ADR-0007
---

# Use studio as the primary launch command

Runelight will use `runelight studio` as the primary user-facing command for opening Studio through the **Runelight-Owned Launch Layer**. We will not preserve `runelight serve` as a compatibility alias because the product language should describe the user's goal, opening Studio, rather than the implementation detail of serving a host route.
