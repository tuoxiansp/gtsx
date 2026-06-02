# gtsx

**Make your React UI knowable — to you and to your agents.**

Every component declares its visual states. Studio renders them. The CLI checks and screenshots them. Agents read them as typed data.

> **TODO — Hero image goes here.**
>
> A Studio screenshot showing a grid of 8–12 real components, each with
> multiple state thumbnails side by side (loading / ready / error / empty),
> so the eye reads "everything, all visible at once" within 2 seconds.
> Light theme, ~1200px wide. An animated GIF cycling through cases beats
> a static frame.

## Install

Give this to an AI coding agent inside your project:

```
Install gtsx in this project. Fetch and install these Agent Skills from
https://github.com/tuoxiansp/gtsx:

- skills/setup-gtsx
- skills/authoring-gtsx
- skills/refactor-to-gtsx
- skills/design-gtsx

After installing them, run the newly installed `setup-gtsx` skill in this project.
```

The agent detects your TypeScript project and Host (Next.js or Vite), installs the right packages, wires `/gtsx/studio`, and verifies everything works.

You will not touch a config file.

## Why gtsx

**You cannot see your own UI.**

Your React codebase has hundreds of visual states — loading, error, empty, overflow, permission-denied, RTL, dark mode — and no place to actually view them. Code review only sees diffs. Designers only see Figma. Every "what does this look like?" question costs a dev server, a click trail, and ten minutes.

This was painful before. With agents writing UI at machine speed, it is now untenable. New states ship unseen. Existing states regress silently. The agent editing your `Button` has no idea what `Button` is supposed to look like in its eight different states.

gtsx gives you back the map.

## What Changes

Before: you ask "what does this look like in error state?" — start dev server, navigate, click, wait, find the state, screenshot, repeat for every component.

After: you open Studio. Every component, every visual state, already rendered on one screen. Your agent sees the same thing you do. When it edits a component, it knows what all eight states are supposed to look like — because they are declared, checked, and visible.

The workflow:

- **You tell the agent to build a component.** It writes the UI and declares the visual states alongside it.
- **You open Studio.** Loading, error, empty, ready — all rendered, no navigation required.
- **The agent refactors something.** If the visual states drift from the component's actual props, the build breaks before anything ships.
- **You want to design a new screen.** You describe it. The agent drafts it as a design frame. You see it in Studio immediately.

What makes this work:

- **A complete map of your UI.** Studio enumerates every component and every visual state in your TypeScript project. Stop guessing what exists.
- **Visual state as a typed contract.** Refactors fail the build the moment cases drift from props.
- **Preview without mocking.** Loading, error, empty, and edge states render without writing a single fetch mock.
- **AI-readable.** Agents enumerate, render, and diff every visual state without running your app.
- **No parallel build.** Plugs into your Next.js or Vite toolchain — no separate stories directory, no config to keep in sync.

## Docs

**Using gtsx:**

- [Authoring Guide](docs/gtsx-authoring-guide.md) — patterns for pure, stateful, and contextual components
- [Refactor Guide](docs/gtsx-refactor-guide.md) — convert existing TSX into `.g.tsx`
- [Design Workspace](docs/gtsx-design-workspace.md) — AI-assisted product design drafts in Studio

**Understanding gtsx:**

- [Design](docs/gtsx-design.md) — architecture, sidecar model, safety guarantees, and easy exit
- [Static Contract](docs/gtsx-static-contract.md) — the type-level contract, JSX branch coverage, and provider variant model

**For AI agents:**

- [Skills](skills/) — agent-executable workflows: [`setup-gtsx`](skills/setup-gtsx/SKILL.md), [`authoring-gtsx`](skills/authoring-gtsx/SKILL.md), [`refactor-to-gtsx`](skills/refactor-to-gtsx/SKILL.md), [`design-gtsx`](skills/design-gtsx/SKILL.md)

## Contributing

pnpm workspace. `pnpm install && pnpm build && pnpm test && pnpm typecheck`.

Packages: `@gtsx/core` (protocol, CLI), `@gtsx/studio` (shell, manifests), `@gtsx/adapter-vite-react` (Vite adapter), and `@gtsx/adapter-next-react` (Next.js adapter). Cross-framework validation fixtures live in [`playground/`](playground/).
