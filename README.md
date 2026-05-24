# GTSX

GTSX is a production TSX case protocol and AI-assisted language-toolchain layer for React components.

The core model:

```txt
GTSX Project = selected TypeScript project + .g.tsx protocol
GTSX Scope = .g.tsx files in the selected TypeScript Program
Host = execution environment that renders that scope
Adapter = bridge that makes the Host understand GTSX boundaries and preview URLs
```

The product invariant is:

> Scope follows TypeScript. Host does not expand scope.

GTSX does not decide scope by app, library, package, or monorepo shape. It resolves a TypeScript project, derives the `.g.tsx` files in that Program, and renders them through a project-native, managed, or external Host.

## Workspace

This repository is a pnpm workspace:

- `packages/gtsx`: protocol, runtime, analyzer, CLI, and project index helpers.
- `packages/studio`: Studio shell and Studio manifest model helpers.
- `packages/adapter-vite-react`: Vite React adapter and preview transform.
- `examples`: Vite example app for current end-to-end behavior.
- `playground`: Host/Adapter validation fixtures shaped like real framework projects.

## Commands

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Package-level commands are also available through pnpm filtering, for example:

```sh
pnpm --filter gtsx test
pnpm --filter @gtsx/adapter-vite-react typecheck
```

## Current CLI Shape

The current CLI resolves a TypeScript project from `-p` / `--project`, or from
the nearest `tsconfig.json` when no project is provided:

```sh
gtsx check [-p <tsconfig-or-directory>] <entry.g.tsx[#export]|dir>
gtsx serve [-p <tsconfig-or-directory>] [--port <port>]
gtsx capture [-p <tsconfig-or-directory>] <entry.g.tsx[#export]|dir> [--case <name>|--all]
```

Directory checks and Studio manifests derive `.g.tsx` entries from the selected
TypeScript Program instead of recursive directory scanning. If no TypeScript
project can be resolved, the CLI keeps the legacy directory scan as a fallback
for host-only fixtures and early setup flows. Host commands use `gtsx.config.ts`
preview URLs from the selected project root or the current host boundary.

## Docs

- [GTSX Authoring Guide](docs/gtsx-authoring-guide.md)
- [Product PRD](docs/gtsx-prd.md)
- [Studio UX and Architecture](docs/gtsx-studio-ux-architecture.md)
- [Studio Installer Prompt](docs/gtsx-studio-installer-prompt.md)
- [Studio Issue Drafts](docs/gtsx-studio-issue-drafts.md)
