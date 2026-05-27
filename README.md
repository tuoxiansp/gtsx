English · [简体中文](README.zh-CN.md)

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
Install gtsx in this project: install the `setup-gtsx`, `authoring-gtsx`,
and `refactor-to-gtsx` skills from the `gtsx` package, then run `setup-gtsx`.
```

The agent detects your TypeScript project and Host (Next.js or Vite), installs the right packages, wires `/gtsx/studio`, and verifies everything works.

You will not touch a config file.

## Why gtsx

**You cannot see your own UI.**

Your React codebase has hundreds of visual states — loading, error, empty, overflow, permission-denied, RTL, dark mode — and no place to actually view them. Code review only sees diffs. Designers only see Figma. Every "what does this look like?" question costs a dev server, a click trail, and ten minutes.

This was painful before. With agents writing UI at machine speed, it is now untenable. New states ship unseen. Existing states regress silently. The agent editing your `Button` has no idea what `Button` is supposed to look like in its eight different states.

gtsx gives you back the map. Every component declares its visual states next to its TSX. Studio renders them. The CLI checks and screenshots them. Agents read them as first-class data.

You get:

- **A complete map of your UI.** Studio enumerates every component and every visual state in your TypeScript project. Stop guessing what exists.
- **Visual state as a typed contract.** Refactors fail the build the moment cases drift from props.
- **Preview without mocking.** Loading, error, empty, and edge states render without writing a single fetch mock.
- **AI-readable.** Agents enumerate, render, and diff every visual state without running your app.
- **No parallel build.** Plugs into your Next.js or Vite toolchain — no separate stories directory, no config to keep in sync.

## Docs

- [Authoring Guide](docs/gtsx-authoring-guide.md) — patterns for pure, stateful, and contextual components
- [Refactor Guide](docs/gtsx-refactor-guide.md) — convert existing TSX into `.g.tsx`
- [Design](docs/gtsx-design.md) — the model, the invariants, and why the protocol is shaped this way

## Contributing

pnpm workspace. `pnpm install && pnpm build && pnpm test && pnpm typecheck`.

Packages: `gtsx` (protocol, CLI), `@gtsx/studio` (shell, manifests), `@gtsx/adapter-vite-react` (Vite adapter). Cross-framework validation fixtures live in [`playground/`](playground/).
