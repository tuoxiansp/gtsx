# gtsx

**Design, build, and review React UI — with your AI agent.**

gtsx is a GUI development workflow for the AI era. Your agent designs screens, builds components, and declares every visual state — typed and verifiable. You describe what you want, open `/gtsx/studio`, and see the full picture. Design, build, and review — one workflow, one URL.

![Studio — every component, every state, one screen](docs/images/studio-components.jpeg)

## Design

Explore directions before writing production code. Tell your agent "design a checkout flow" or "try three layouts for the settings page." It drafts visual frames in Studio's design workspace — you see them side by side, give feedback, iterate until the direction is right.

No mockup tool. No handoff. Design and production live in the same workspace.

![Studio design workspace](docs/images/studio-design.jpeg)

## Build

Describe what you want: "Build a user card with loading, error, and ready states." Your agent writes the component and declares every visual state in the same file — typed and verifiable. It handles the patterns through installed skills. You stay at the level of intent.

Building an admin panel with different views for admins, regular users, and anonymous visitors? Your agent models those as variant states. Pages that look different when data is empty vs. populated? Declared and visible — without manually switching accounts or seeding databases.

## Review

Open `/gtsx/studio`. Every component in your project, every visual state — rendered on one screen. Toggle filters to see how your UI responds across contexts: admin vs. regular user, signed-in vs. anonymous, empty vs. loaded.

No navigating your app. No clicking through flows. No test data. One URL.

![Toggle USERSIGN to anonymous — every component responds](docs/images/studio-variant-filter.jpeg)

Because every state is declared and type-checked, your agent can also verify its own work — catching visual drift before you even open Studio.

## Get Started — One Prompt

Paste this into your AI agent:

```
Install gtsx in this project. Fetch and install these Agent Skills from
https://github.com/tuoxiansp/gtsx:

- skills/setup-gtsx
- skills/authoring-gtsx
- skills/refactor-to-gtsx
- skills/design-gtsx

After installing them, run the newly installed `setup-gtsx` skill in this project.
```

The agent detects your project (Vite / Next.js), installs packages, wires Studio, and verifies everything works. ~2 minutes.

Already have components? Tell your agent to run the `refactor-to-gtsx` skill — it converts your existing codebase.

## Under the Hood

A gtsx component is a normal React file (`.g.tsx`) with one static object appended:

```tsx
import type { GFrames } from "@gtsx/core"

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

That `.frames` object is the entire footprint — inert data that never runs in production and never appears in your bundle. Your agent writes it. The type checker keeps it in sync.

No config files. No separate build step. Nothing to maintain.

### Leave Anytime

Rename `.g.tsx` → `.tsx`, delete `.frames`, remove the Studio route. Plain React. No lock-in.

## Docs

**Using gtsx:**

- [Authoring Guide](docs/gtsx-authoring-guide.md) — patterns for pure, stateful, and contextual components
- [Refactor Guide](docs/gtsx-refactor-guide.md) — convert existing TSX into `.g.tsx`
- [Design Workspace](docs/gtsx-design-workspace.md) — AI-assisted product design drafts in Studio

**Understanding gtsx:**

- [Design](docs/gtsx-design.md) — architecture, sidecar model, and guarantees
- [Static Contract](docs/gtsx-static-contract.md) — the type-level contract, JSX branch coverage, and provider variant model

**For AI agents:**

- [Skills](skills/) — agent-executable workflows: [`setup-gtsx`](skills/setup-gtsx/SKILL.md), [`authoring-gtsx`](skills/authoring-gtsx/SKILL.md), [`refactor-to-gtsx`](skills/refactor-to-gtsx/SKILL.md), [`design-gtsx`](skills/design-gtsx/SKILL.md)

## Contributing

pnpm workspace. `pnpm install && pnpm build && pnpm test && pnpm typecheck`.

Packages: `@gtsx/core` (protocol, CLI), `@gtsx/studio` (shell, manifests), `@gtsx/adapter-vite-react` (Vite adapter), and `@gtsx/adapter-next-react` (Next.js adapter). Cross-framework validation fixtures live in [`playground/`](playground/).
