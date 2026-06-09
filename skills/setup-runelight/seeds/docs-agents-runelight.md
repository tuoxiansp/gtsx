# Runelight (project agent context)

Written by `setup-runelight`. Update when integration facts change.

## Integration

- **Profile**: <!-- e.g. Vite React, Next.js App Router, Vite Vue -->
- **TypeScript project**: <!-- e.g. tsconfig.app.json -->
- **`project.sourceRoot`**: <!-- e.g. src -->
- **`project.entryRoot`**: <!-- e.g. app/runelight -->
- **`project.namespace`**: <!-- package or repo slug -->
- **`host.command`**: <!-- command with {port} placeholder -->

## Routes (defaults)

- Preview: `/runelight`
- Studio: `/runelight/studio`
- Manifest: `/runelight/studio/manifest`
- Design board: `/runelight/studio#/design`
- Design frames: `${project.entryRoot}/design/`

## Verification

```sh
runelight check <source-root-or-file>
# start dev server via package manager or: runelight serve
```

Open `/runelight/studio` and, when entries exist, one `/runelight?entry=...&frame=...` URL.

## Project-level skills

Installed under `.agents/skills/` for this framework:

- `setup-runelight`
- `authoring-runelight-{react|vue}`
- `refactor-to-runelight-{react|vue}`
- `design-runelight-{react|vue}`

Human docs: `docs/`. Agent interface: installed skill copies above.
