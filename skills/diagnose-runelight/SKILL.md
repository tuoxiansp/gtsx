---
name: diagnose-runelight
description: Troubleshoot Runelight Studio, preview routes, manifest, layout isolation, and runelight.config.ts integration issues. Use when Studio is empty, preview shows Missing entry, Next.js layout runs production hooks on /runelight, or runelight serve/capture fails.
---

# Diagnose Runelight Integration

Structured troubleshooting for Runelight dev integration. Human reference: [docs/troubleshooting.md](../../docs/troubleshooting.md).

## Loop

1. **Reproduce** — exact URL, command, and error text.
2. **Config** — read `runelight.config.ts`: `project.sourceRoot`, `project.entryRoot`, `host.command`. Reject obsolete `preview.*` or `routes` keys.
3. **Scope** — `runelight check` on affected `.g.*` files; `runelight diagnose` if available.
4. **Manifest** — open `/runelight/studio/manifest`; confirm coordinates and frames.
5. **Host boundary** — Next.js: audit layout chain for `/runelight`. Vite: confirm browser entry branches only on `/runelight`, not Studio.
6. **Fix minimally** — smallest glue change; preserve working local customizations.
7. **Verify** — typecheck, `runelight check`, Studio, one preview URL.

## Quick checks

| Symptom | Likely cause |
|---------|----------------|
| Empty Studio | Missing `entryRoot`, stale generated entries, need dev server restart |
| Design board empty | Files not under `${entryRoot}/design/` or missing `live` frame |
| Missing entry | Wrong `entry` query param vs manifest |
| App API calls on `/runelight` | Production layout/providers wrapping preview routes |
| serve fails immediately | Missing or invalid `host.command` |
| Vue branch diagnostic | Frame `scope` does not reach template branch |

## Escalation

- Re-run [setup-runelight](../setup-runelight/SKILL.md) in upgrade/ensure mode if packages and glue diverged.
- For layout isolation, follow [next-app-router profile](../setup-runelight/profiles/next-app-router.md#app-router-layout-boundary-audit-and-remediation).

## Report

- Root cause
- Files changed
- Verification performed
- Remaining risks
