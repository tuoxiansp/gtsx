---
name: write-runelight-skill
description: Create or revise Runelight agent skills under skills/. Use when adding skills, editing SKILL.md frontmatter, setup profiles, or skill documentation structure for this repository.
---

# Write Runelight Skills

Conventions for skills in this repository. Inspired by progressive-disclosure skill design; Runelight installs skills via agent copy, not `npx skills add`.

## Structure

```
skills/<skill-name>/
├── SKILL.md           # Required: workflow + links (target <100 lines)
├── REFERENCE.md       # Optional: detailed patterns
├── profiles/          # setup-runelight only
└── seeds/             # Templates written into user projects
```

## SKILL.md

```yaml
---
name: kebab-case-name
description: What it does. Use when [specific triggers, file types, user phrases].
---
```

- Description is the routing signal — include triggers and file extensions.
- Third person; max ~1024 characters.
- Use `disable-model-invocation: true` on setup/bootstrap skills that should not auto-run.

## Progressive disclosure

- Keep `SKILL.md` under ~100 lines when possible.
- Put long patterns in `REFERENCE.md` or `profiles/`.
- Link one level deep from `SKILL.md` — avoid `../../` across unrelated skills.
- Do not duplicate `docs/` prose; link to `docs/` for human concepts.

## Setup profiles

- `runelight.config.ts` examples must use `host.command` — see [docs/runelight-config.md](../../docs/runelight-config.md).
- Do not document obsolete `preview.serve` or configurable `routes`.
- Vite browser entries branch on `/runelight` only; Studio is adapter-served.

## Framework pairs

React and Vue skills stay separate for description routing. Shared aesthetic reference (`DESIGN_REFERENCE.md`) may be duplicated across design skills until a single-source migration is implemented — do not start that migration unless explicitly requested.

## Checklist

- [ ] Description has clear triggers
- [ ] Config examples match `packages/core/src/config-types.ts`
- [ ] Linked human doc updated when contract changes
- [ ] Intelligence test updated if setup outcomes change
- [ ] `skills/README.md` index updated for new skills

## Related

- [intelligence-test](../../.agents/skills/intelligence-test/SKILL.md) — E2E validation
- [write-intelligence-test](../../.agents/skills/write-intelligence-test/SKILL.md) — `.it.md` task cards
