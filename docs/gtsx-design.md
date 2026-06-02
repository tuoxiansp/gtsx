# gtsx Design

gtsx is engineered to add visibility to your React UI without taking ownership of anything else in your project. This doc explains why adopting gtsx is safe, low-risk, and easy to reverse.

For day-to-day usage see the [Authoring Guide](./gtsx-authoring-guide.md). For migration patterns see the [Refactor Guide](./gtsx-refactor-guide.md).

## The Core Formula

```txt
gtsx = TSX + a small protocol
```

A `.g.tsx` file is a real TypeScript React component file. Your TypeScript compiler reads it. Your bundler reads it. Your tests run it. If gtsx disappeared from the planet tomorrow, you would still have working TSX.

The protocol layer is small. It adds three things, all optional, all additive:

1. **A naming convention** — the `.g.tsx` extension marks files that participate in the protocol.
2. **A static export** — `Component.cases = { ... }` declares the component's visual states.
3. **Two seam helpers** — `createGScopeHook` for previewing stateful components, `createGProvider` for previewing context-dependent components and, when useful, declaring named provider variants.

None of these modify React. None change how your component renders in production. None require modifying the component's own runtime code.

The important constraint is that the protocol must remain statically visible. gtsx does not need to understand every possible JavaScript execution path, but it does need to understand the visual branches a `.g.tsx` component exposes. If props, gtsx scope, or gtsx provider context decide whether JSX appears, that decision must be written in a form `gtsx check` can inspect and the cases must include a state that reaches it.

## What gtsx Will Not Do To Your Project

gtsx is engineered to stay out of your way. It will not:

- **Change how your app behaves in production.** Cases are static data attached to component functions — nothing in your production code paths reads them. The preview runtime that does is separate code, loaded only by Studio.
- **Replace your build.** Adapters integrate with your existing Next.js or Vite pipeline. There is no parallel bundler, no replacement toolchain, no second dev server.
- **Touch your data layer.** gtsx has no opinions about fetching, caching, stores, or providers. The scope seam lets you swap them at preview time without changing how they work in production.
- **Own your router.** Studio mounts at `/gtsx/studio`. Preview mounts at `/gtsx`. You add these routes; you can remove them. They do not collide with anything else.
- **Dictate your file structure.** Scope follows your TypeScript Program. Put files wherever you already put them.
- **Lock you in.** Adapters are thin shims. Move to a different host? Swap the adapter. Want out entirely? See [Easy Exit](#easy-exit) below.

## Sidecar Architecture

gtsx is shaped as a sidecar to your app, not a layer wrapped around it:

```txt
┌──────────────────┐         ┌──────────────────┐
│  Your App        │         │  gtsx Studio     │
│  routes          │         │  /gtsx/studio    │
│  components      │         │  /gtsx           │
│  providers       │         │                  │
│  data layer      │         │                  │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         └──────────────┬─────────────┘
                        │
              ┌─────────▼─────────┐
              │  Your Build/Host  │
              │ (Next.js / Vite)  │
              └───────────────────┘
```

The sidecar reads `.g.tsx` files via the TypeScript Program. It does not modify your routes, your providers, your data layer, or your bundler config — beyond registering the two preview routes. Your app and the sidecar share the same Host because that is the cheapest way to render your real components in your real environment; they do not share ownership of anything else.

Sharing the Host has one practical consequence: the preview route must recreate appearance, not app behavior. If a component depends on app-wide CSS, design-system stylesheets, font/style setup, or static root selectors such as theme, base color, density, or style preset classes, the `/gtsx` route needs those visual pieces too. If the normal app route provides them through static DOM or imports, the preview route should mirror that static shell around the adapter preview client.

That boundary is intentional. The preview route should not pull in production layouts or providers just to get the right look if those wrappers run ordinary React hooks, app clients, routing clients, network I/O, subscriptions, timers, or effects. Visual state belongs in `.g.tsx` cases through props, scope, and gtsx providers; route-level setup stays limited to framework parsing, CSS/setup imports, static wrapper DOM, SSR bootstrap scripts, and adapter loading.

For Next.js App Router, this boundary includes inherited layouts. A `/gtsx` page under `app/gtsx/page.tsx` cannot opt out of `app/layout.tsx` or parent segment layouts. If those layouts mount production shell components, the preview/studio route will execute their hooks and effects before the adapter preview client renders. Isolate GTSX routes with a minimal root layout or route groups, and keep production providers, app clients, subscriptions, navigation, and data fetching in an app-only route group.

## Design Workspace

gtsx also has a lightweight design workspace for AI-assisted product design drafts. It uses the same local preview route and the same Studio shell, but it is deliberately scoped as scratch design work rather than formal component coverage.

The user-facing flow is:

```txt
local agent conversation
  -> edits project.root/.gtsx/design/*.g.tsx
  -> /gtsx/studio#/design
  -> draggable frames on a canvas
```

Each `project.root/.gtsx/design/*.g.tsx` file is one design frame. `project.root` comes from `gtsx.config.ts` and defaults to `src`. Studio discovers those files and renders them in the Design view. The frame's position on the board is browser-local state stored in `localStorage`; it is not written into the repository. This keeps the repo focused on the actual design drafts while letting the user freely arrange the board.

Design frames use a smaller contract than production component models:

- one default-exported React component per file
- one happy-path case named `live`
- multiple alternatives as multiple files, not multiple cases
- self-contained TSX preferred, so quick design drafts do not depend on fragile helper resolution

Example:

```tsx
"use client"

import type { GCases } from "@gtsx/core"

export default function DiscoveryFeed() {
  return <main>{/* visual draft */}</main>
}

DiscoveryFeed.cases = {
  live: { props: {} },
} satisfies GCases<Record<string, never>>
```

Open the board at:

```txt
/gtsx/studio#/design
```

Open one frame directly at:

```txt
/gtsx?entry=src%2F.gtsx%2Fdesign%2FDiscoveryFeed.g.tsx%23default&case=live&chrome=0
```

This design surface intentionally differs from component cases. Component `.g.tsx` files in the TypeScript Program are the durable UI model: they should cover meaningful visual states, provider variants, and branch reachability. `project.root/.gtsx/design` is for early product exploration: a happy-path frame that can be revised quickly by the local agent while the user thinks through shape, density, copy, and interaction.

Short prompts are treated as seeds, not complete specs. The quality bar comes from the workflow around the prompt: the local agent scans the product context, expands the intent into a small brief, chooses one happy path, drafts a frame, critiques it, and revises before handing it back. This is the important distinction: gtsx Design should not depend on magic wording from the user to get a useful first result.

The agent's design loop is:

1. Inspect the existing product surface, including styles, tokens, UI primitives, copy tone, route shape, and likely viewport.
2. Expand the request into product surface, context of use, interaction weight, taste constraints, and one concrete happy path.
3. Ask a clarifying question only when the missing choice would change the product direction; otherwise make a visible assumption and proceed.
4. Plan the information hierarchy, primary action, secondary actions, data density, and visual system before writing TSX.
5. Generate or update a self-contained design frame in `project.root/.gtsx/design`.
6. Run a design critique pass and revise if the frame is generic, unclear, visually weak, inaccessible, or inconsistent with the product domain.

The review standard is design-oriented. A good frame should make the screen's purpose legible within seconds, expose a clear primary action, arrange information in the order a user needs it, use realistic content, maintain spacing and type rhythm, avoid overflow or overlapping controls, and feel appropriate to the product domain. For example, an operations dashboard should be dense and scannable, while a consumer mobile flow can be more directional and touch-led. If the project has a design system, the agent should reuse it; if not, the frame should define a small coherent local system instead of drifting into generic AI styling.

## The Production Path

A `.g.tsx` component in production runs identically to any other React component:

```tsx
// Counter.g.tsx
const useScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: Props) {
  const scope = useScope(props)
  return <button onClick={scope.increment}>{scope.count}</button>
}

Counter.cases = { /* ... */ }  // inert in production
```

In production:

- `useScope(props)` calls `useRealCounterScope(props)`. The result is the real value.
- `Counter.cases` is a static property on the function. Nothing in your runtime ever reads it.
- The preview runtime is not loaded. It is not in your shipped bundle.

Cases are inert data attached to a function reference. They cannot accidentally execute, cannot leak network calls, cannot break your app at runtime. They are visible only to the preview runtime, which only exists when Studio is rendering.

## The Preview Path

In Studio and preview, a substitution happens at exactly one boundary — the scope seam:

- `useScope()` returns the case-supplied `scope` instead of calling the real hook.
- Provider entries in the case replace the real provider state.
- The render path is the same component, the same TSX, the same React.

The component code itself does not branch on "am I in preview?". The substitution happens above it, at the seam. This means your component code stays simple, your production behavior stays correct, and there is exactly one well-defined place where preview differs from production.

## The Static Contract

Cases are more than named screenshots. They are the static contract between a component's visual structure and the values that drive it.

For a `.g.tsx` component, gtsx treats three inputs as the source of visual state:

- `props`
- the value returned from a `createGScopeHook(...)` hook
- values read through `useGContext(Provider)`

Provider variants are a semantic label on that third input. A provider can opt into a finite axis such as `login | anonymous`, `light | dark`, or `reviewer | regular`. Cases then mark which variant they represent with `GProviderCase<typeof Provider, "variant">`; a case that is genuinely orthogonal to the axis can stay unmarked, and a case that intentionally covers more than one environment can use a union such as `GProviderCase<typeof Provider, "login" | "anonymous">`. The marker is static metadata: it tells Studio and `gtsx check` what environment state the case covers. Runtime context state is still supplied separately through `providers: [[Provider, value]]`.

When one of those values controls whether a child component or JSX subtree is rendered, `gtsx check` follows that control flow and asks a narrow question: does at least one case make this branch reachable? It does not try to prove every combination of every prop. It only prevents a visual branch from being present in the component while disappearing entirely from the case set.

This is why JSX-producing control flow must stay first-order over the gtsx inputs. Direct conditionals, `if` returns, `&&`, `||`, direct comparisons, JSX children, slots, and collection callbacks such as `props.items.map((item) => item.visible ? <Row /> : null)` are inspectable because the JSX branch can be traced back to `props`, scope, or context. Helper predicates, statement-level branching such as `switch` or loops that return JSX, stored JSX variables, and callback sources that cannot be traced to gtsx inputs are opaque. They may be valid React, but they are not valid gtsx protocol shape unless refactored into inspectable expressions.

Case values follow the same rule. Literal props, scope values, provider values, and literal arrays can be inspected. Values imported from helpers or composed through spread may still typecheck, but they are not static enough for branch coverage; when they affect JSX reachability, `gtsx check` reports that uncertainty instead of silently accepting it.

Provider variant coverage follows the same philosophy. If a component consumes a provider with declared variants, its cases must cover those variants. Unmarked cases are neutral in Studio, but they are not proof that the provider variants were covered. A child component that only receives plain props can still mark cases with `GProviderCase` when those props are projections of a parent environment; this lets Studio show the same environment axis without forcing the child to read context. If gtsx sees provider-derived props flowing into an unmarked child, it reports a non-blocking warning so an agent can decide whether the child really needs projection markers. Child projection cases supplement Studio expression; they do not replace the parent component's coverage obligation when the parent consumes the provider.

In Studio, declared provider variants become environment controls. A root selection acts like an upstream variant constraint for the canvas. A component-level selection acts like a local override. Cases remain visible; matching and mismatching cases are distinguished instead of being filtered away, so the canvas keeps showing the full state model while making the active environment obvious.

Coverage and control-flow diagnostics are fatal. `gtsx check` exits non-zero for opaque control flow, unknown branch coverage, uncovered JSX branches, or missing consumed provider variants. Projection hints are warnings: they are meant to point an agent at a possible coverage gap without claiming the child component is definitely wrong. The point is not to restrict how production React works. The point is to make sure Studio's map of a component's visual states cannot drift away from the component's real TSX.

## Easy Exit

If you decide gtsx is not for you, removal is mechanical and gradual. There is no proprietary file format, no data migration, no schema to unwind:

1. **Remove `Component.cases` exports.** Components still work. They are now ordinary TSX with a stray ignored property — or you delete that line too.
2. **Replace `useScope()` calls with the underlying real hook.** Components still work, behaving exactly as they did before the seam was introduced.
3. **Rename `.g.tsx` → `.tsx`.** TypeScript still compiles. Imports update once.
4. **Remove the adapter from your build config.** Your app still builds.
5. **Delete the `/gtsx/studio` and `/gtsx` routes.** Your app still runs.

What is left is what you started with: ordinary TypeScript React components.

## The Model

gtsx defines four primitives, no more:

```txt
gtsx Project = your TypeScript project + the .g.tsx protocol
gtsx Scope   = .g.tsx files in the selected TypeScript Program
Host         = your framework runtime (Next.js / Vite / ...)
Adapter      = the sidecar that mounts the gtsx preview surface in the Host
```

The invariant:

> Scope follows TypeScript. Host does not expand scope.

You decide what is in your TypeScript Program. gtsx decides nothing about your project shape, your folder layout, your monorepo boundaries, or your build configuration. Whatever your TypeScript Program already contains is what gtsx knows about.
