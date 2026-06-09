# Runelight

**The visual workspace for agent-built apps.**

[runelight.ai](https://runelight.ai)

Runelight is a GUI development workflow for the AI era. Your agent designs screens, builds components, and declares every visual state - typed and verifiable. You describe what you want, start `runelight serve`, open `/runelight/studio`, and see the full picture. Design, build, and review in one workspace.

![Studio — every component, every state, one screen](docs/images/studio-components.jpeg)

## Design

Explore directions before writing production code. Tell your agent "design a checkout flow" or "try three layouts for the settings page." It drafts visual frames in Studio's design workspace — you see them side by side, give feedback, iterate until the direction is right.

Design and production live in the same workspace, so exploratory frames can move toward implementation without a separate handoff.

![Studio design workspace](docs/images/studio-design.jpeg)

## Build

Ask your agent to build the component or screen you want, the same way you would in any supported app: a user card, a settings panel, a checkout step. In a Runelight project, the implementation does not stop at the happy path. The agent keeps meaningful visual states beside the component as frames, and `runelight check` validates that reachable branches are represented.

For admin panels, role-specific views become provider variants. For pages that look different when data is empty or populated, those states become frames. They are visible in Studio without switching accounts or seeding databases.

## Review

Run `runelight serve`, then open `/runelight/studio`. Every component in your project, every visual state — rendered on one screen. Toggle filters to see how your UI responds across contexts: admin vs. regular user, signed-in vs. anonymous, empty vs. loaded.

Studio gives you one URL for scanning those branches without manually navigating app flows or preparing test data.

![Toggle USERSIGN to anonymous — every component responds](docs/images/studio-variant-filter.jpeg)

Because every state is declared and type-checked, your agent can also verify its own work — catching visual drift before you even open Studio.

## Get Started — One Prompt

Runelight skills are installed **by your agent** (copied into the project), not via a one-shot `npx` installer. That keeps setup, Host detection, and verification inside the agent workflow.

Paste this into your AI agent:

```
Install or upgrade Runelight in this project.

Fetch or refresh only this Runelight Agent Skill from
https://github.com/tuoxiansp/runelight:

- skills/setup-runelight

Install it as a project-level skill in this repository.

After refreshing that setup skill, run `setup-runelight` in this project now.
Follow it through setup and verification.
```

The agent detects your project, installs packages, wires Studio, installs framework-specific companion skills, and verifies the integration.

## Supported Projects

Runelight currently supports TypeScript React projects and TypeScript Vue 3 projects.

Non-React/Vue frameworks are not in scope yet.

Already have components? After setup, tell your agent to run the installed framework-specific refactor skill.

## Under the Hood

Runelight is built on the [`.g` protocol](docs/g-protocol.md) for modeling UI states. React uses `.g.tsx`: a normal React file with one static object appended. Vue uses `.g.vue`: a normal SFC with one `<g:frames>` custom block.

```tsx
import type { GFrames } from "@runelight/core"

type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.frames = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GFrames<BadgeProps>
```

`Component.frames` is static metadata for Studio and `runelight check`. Production render paths do not read frames; preview runtime is separate dev-only code loaded by adapters.

Protocol types and helpers use the `G` prefix, such as `GFrames`, `createGScopeHook`, and `createGProvider`.

No preview wrappers in your components. No separate app shell to maintain. Your project remains a normal Vite, Next.js, or custom Host project; `@runelight/cli` starts that Host through `runelight serve`, and the framework adapter serves the prebuilt `@runelight/studio` app at `/runelight/studio`.

### Leave Anytime

Rename `.g.tsx` → `.tsx` or `.g.vue` → `.vue`, delete frames, remove the Studio route. Plain app code. No lock-in.

## Docs

**Using Runelight (React):**

- [Authoring Guide](docs/runelight-authoring-guide.md) — `.g.tsx` patterns
- [Refactor Guide](docs/runelight-refactor-guide.md) — migrate TSX to `.g.tsx`
- [Design Workspace](docs/runelight-design-workspace.md) — product design drafts in Studio

**Using Runelight (Vue):**

- [Vue Authoring Guide](docs/runelight-authoring-guide-vue.md) — `.g.vue` patterns
- [Vue Refactor Guide](docs/runelight-refactor-guide-vue.md) — migrate SFCs to `.g.vue`

**Reference:**

- [CLI](docs/cli.md) — `check`, `serve`, `capture`, `init`, `diagnose`
- [Configuration](docs/runelight-config.md) — `runelight.config.ts`
- [Troubleshooting](docs/troubleshooting.md) — Studio, preview, Next.js layouts
- [Testing](docs/testing.md) — unit tests and intelligence tests

**Understanding Runelight:**

- [Design](docs/runelight-design.md) — architecture, sidecar model, and guarantees
- [.g Protocol](docs/g-protocol.md) — frames, seams, and static checks
- [Static Contract](docs/runelight-static-contract.md) — branch coverage and diagnostics

**For AI agents:**

- [Skills index](skills/README.md) — [`setup-runelight`](skills/setup-runelight/SKILL.md), authoring, refactor, design, [`diagnose-runelight`](skills/diagnose-runelight/SKILL.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Quick check: `pnpm install && pnpm build && pnpm test && pnpm typecheck`.

Packages: `@runelight/cli`, `@runelight/core`, `@runelight/studio`, `@runelight/adapter-vite-react`, `@runelight/adapter-next-react`, `@runelight/adapter-vite-vue`. Examples: [`examples/`](examples/). Agent E2E specs: [`intelligence-tests/`](intelligence-tests/).
