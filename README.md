# Runelight

**The visual feedback loop for agent-polished UI.**

[runelight.ai](https://runelight.ai)

Runelight gives AI agents a visual feedback loop for front-end polish. In Runelight-covered UI, real components expose typed `.g` frames with agent-readable visual intent. Your agent can inspect reachable preview targets, observe the exact states it changes, edit source, and re-observe until the UI holds together.

![Studio — Runelight-covered frames in one workspace](docs/images/studio-components.jpeg)

## Polish

Ask your agent to polish a Runelight-covered component or screen. The installed `polish` skill drives a tight observe-edit-reobserve loop over real preview targets, so visual fixes are grounded in what Studio and capture can actually render.

Polish currently targets `.g.tsx` and `.g.vue` coverage: component frames, exported component coordinates, and the preview paths derived from them. It is not a promise to blindly edit arbitrary app routes without Runelight coverage.

## Cover Existing UI

Need coverage first? Ask your agent to author a new `.g` component or refactor an existing component into `.g` format. In a Runelight project, implementation does not stop at the happy path. The agent keeps meaningful visual states beside the component as frames, and `runelight check` validates that reachable branches are represented.

For admin panels, role-specific views become provider variants. For pages that look different when data is empty or populated, those states become frames. They are visible in Studio without switching accounts or seeding databases.

## Review

Run `runelight serve`, then open `/runelight/studio`. Runelight-covered components and their declared visual states render in Studio. Toggle filters to see how your UI responds across contexts: admin vs. regular user, signed-in vs. anonymous, empty vs. loaded.

Studio gives you one URL for scanning those branches without manually navigating app flows or preparing test data.

![Toggle USERSIGN to anonymous — covered frames respond](docs/images/studio-variant-filter.jpeg)

Because covered states are declared and type-checked, your agent can verify its own work through the same preview and capture loop you can inspect.

## Get Started — One Prompt

Paste this into your AI agent:

```
Install or upgrade Runelight in this project.

Fetch or refresh only this Runelight Agent Skill from
https://github.com/tuoxiansp/runelight:

- skills/setup-runelight

Install it as a project-level skill in this repository
(e.g. at .agents/skills/setup-runelight).

After refreshing that setup skill, run `setup-runelight` in this project now.
Follow it through setup and verification.
```

The agent detects your project, installs packages, wires Studio, installs the matching project-level authoring/refactor/polish skills, and verifies everything works.

## Supported Projects

Runelight currently supports TypeScript React projects and TypeScript Vue 3 projects.

Non-React/Vue frameworks are not in scope yet.

Already have components? After setup, tell your agent to run the installed framework-specific refactor skill, then use `polish` on the Runelight-covered UI.

## Under the Hood

Runelight is built on the [`.g` protocol](docs/g-protocol.md) for modeling UI states. React uses `.g.tsx`: a normal React file with one static object appended. Vue uses `.g.vue`: a normal SFC with one `<g:frames>` custom block.

```tsx
import type { GFrames } from "@runelight/react/runtime"

type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: {
    description: "Neutral badge showing a ready state",
    props: { tone: "neutral", label: "Ready" },
  },
  warning: {
    description: "Warning badge showing an item that needs review",
    props: { tone: "warning", label: "Needs review" },
  },
} satisfies GFrames<BadgeProps>
```

That `.frames` object is the component-level footprint - inert data that never runs in production and never appears in your bundle. Your agent writes it. The type checker keeps it in sync.

Protocol names carry a `G` marker: `G`-prefixed types such as `GFrames`, and `createG*`/`useG*` helpers such as `createGScopeHook` and `createGProvider`.

No preview wrappers in your components. No separate app shell to maintain. Your project remains a normal Vite, Next.js, or custom Host project; `@runelight/cli` starts that Host through `runelight serve`, and the framework adapter serves the prebuilt `@runelight/studio` app at `/runelight/studio`.

### Leave Anytime

Rename `.g.tsx` → `.tsx` or `.g.vue` → `.vue`, delete frames, remove the Studio route. Plain app code. No lock-in.

## Docs

**Using Runelight:**

- [React Authoring Guide](docs/runelight-authoring-guide.md) — patterns for pure, stateful, and contextual React components
- [Vue Authoring Guide](docs/runelight-vue-authoring-guide.md) — template-first patterns for `.g.vue` SFCs
- [React Refactor Guide](docs/runelight-refactor-guide.md) — convert existing TSX into Runelight format
- [Vue Refactor Guide](docs/runelight-vue-refactor-guide.md) — convert existing Vue SFCs into Runelight format
- [CLI Reference](docs/runelight-cli.md) — `check`, `inspect`, `preview-targets`, `changes`, `serve`, and `capture`
- [Configuration Reference](docs/runelight-configuration.md) — `runelight.config.ts` fields, defaults, and production behavior

**Understanding Runelight:**

- [Design](docs/runelight-design.md) — architecture, sidecar model, and guarantees
- [.g Protocol](docs/g-protocol.md) — the source-level model behind frames, seams, and static checks
- [Static Contract](docs/runelight-static-contract.md) — the type-level contract, JSX branch coverage, and provider variant model

**For AI agents:**

- [Skills](skills/) — agent-executable workflows: [`setup-runelight`](skills/setup-runelight/SKILL.md), [`authoring-runelight-react`](skills/authoring-runelight-react/SKILL.md), [`authoring-runelight-vue`](skills/authoring-runelight-vue/SKILL.md), [`refactor-to-runelight-react`](skills/refactor-to-runelight-react/SKILL.md), [`refactor-to-runelight-vue`](skills/refactor-to-runelight-vue/SKILL.md), [`polish`](skills/polish/SKILL.md)

## Contributing

pnpm workspace. `pnpm install && pnpm build && pnpm test && pnpm typecheck`.

Packages: `@runelight/cli` (the `runelight` command; agent automation can use `runelight inspect --json` for static GUI maps, paged `runelight preview-targets --json` output for browser preview paths, `runelight capture <entry>` for ordinary screenshots, `runelight capture --path` for selected preview-target screenshots, and `runelight changes --json` for workspace changes), `@runelight/core` (framework-neutral protocol, config, and contract injection), `@runelight/changes` (shared implementation package for workspace change classification), `@runelight/react` (React runtime, preview, and contract modules), `@runelight/vue` (Vue runtime, preview, and contract modules), `@runelight/studio` (prebuilt Studio app and manifests), `@runelight/adapter-vite-react` (Vite React adapter), `@runelight/adapter-next-react` (Next.js adapter), and `@runelight/adapter-vite-vue` (Vite Vue adapter). The product website lives in [`apps/website`](apps/website/). Repository examples live under [`examples/`](examples/), including `react-vite` and `vue-vite`; agent-driven end-to-end goals live in [`intelligence-tests/`](intelligence-tests/).
