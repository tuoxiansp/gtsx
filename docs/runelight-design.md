# Runelight Design

How Runelight works - the architecture, the sidecar model, and what it does and doesn't touch in your project.

For the type-level contract and branch coverage rules, see [Static Contract](./runelight-static-contract.md). For the design workspace, see [Design Workspace](./runelight-design-workspace.md).

---

## The Formula

```
Runelight = your UI source + the .g protocol + Studio
```

A `.g.tsx` file is a real TypeScript React component. A `.g.vue` file is a real Vue SFC with a Runelight `<g:frames>` custom block. Your compiler reads it. Your bundler reads it. Your tests run it.

The [`.g` protocol](./g-protocol.md) is Runelight's technical layer for modeling UI states close to source code. React/TSX uses the `.g.tsx` file format. Vue uses the `.g.vue` file format. Other frameworks can grow their own `.g.*` formats without changing the Runelight brand.

The protocol adds three things. All optional. All additive:

1. **A naming convention.** The `.g.tsx` extension marks React/TSX files; `.g.vue` marks Vue SFC files.
2. **A static export.** React uses `Component.frames`; Vue uses a `<g:frames>` block with `export default { ... }`.
3. **Seam helpers or frame scope.** React uses `createGScopeHook` and `createGProvider`. Vue preview can inject frame `props` and `scope` directly into the SFC template, and can provide native Vue injection keys from frame `provide` entries.

Protocol types and helpers use the `G` prefix: `GFrames`, `GProviderFrame`, `createGScopeHook`, `createGProvider`, `useGContext`, `GVueFrames`, `GVueProvideFrame`, and `defineGInjectionKey`.

None of these modify React. None change how your component renders in production.

## The Model

Four primitives. No more.

| Primitive | What it is |
|-----------|-----------|
| **Runelight Project** | Your TypeScript project + the `.g` protocol |
| **Runelight Scope** | The `.g.tsx` and `.g.vue` files in the selected TypeScript Program |
| **Host** | Your framework runtime — Next.js, Vite, or anything else |
| **Adapter** | The thin shim that mounts Runelight preview inside your Host |

The invariant:

> Scope follows TypeScript. Host does not expand Scope.

Whatever your TypeScript Program already contains is what Runelight knows about. Runelight decides nothing about your project shape, folder layout, monorepo boundaries, or build configuration.

One more concept worth naming: **the seam**. This is the single boundary where preview differs from production. In production, a scope hook calls your real hook. In preview, the same scope hook returns the frame-supplied value instead. The component itself never branches on "am I in preview?" — the substitution happens above it, at the seam.

## How It Works

### Production

A `.g.tsx` component in production is identical to any other React component:

```tsx
const useScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: Props) {
  const scope = useScope(props)
  return <button onClick={scope.increment}>{scope.count}</button>
}

Counter.frames = { /* ... */ }
```

What happens at runtime:

- `useScope(props)` calls `useRealCounterScope(props)`. Full stop.
- `Counter.frames` is a static property on a function. Nothing in your app reads it.
- The preview runtime is not loaded. Not in your bundle.

Frames are inert data. They cannot execute, cannot leak network calls, cannot break your app.

### Preview

In Studio, a substitution happens at the seam:

- `useScope()` returns the frame-supplied `scope` instead of the real hook.
- Provider entries in the frame replace the real provider state.
- The render path is the same component, the same TSX, the same React.

One boundary. One well-defined difference. Everything else is shared.

## Architecture

Runelight is a dev sidecar for your existing Host, not a replacement runtime:

```
┌──────────────────┐         ┌──────────────────┐
│  Your App        │         │  Runelight Studio │
│  routes          │         │  /runelight/studio│
│  components      │         │  /runelight       │
│  providers       │         │                  │
│  data layer      │         │                  │
└────────┬─────────┘         └────────┬─────────┘
         │                            │
         └──────────────┬─────────────┘
                        │
              ┌─────────▼─────────┐
              │ runelight serve   │
              │ starts your Host  │
              │ (Next.js / Vite)  │
              └───────────────────┘
```

Your app and Runelight share the same Host so Studio can render real components in the real framework environment. The project remains a Next.js, Vite, or custom Host project. The Runelight CLI gives the development workflow a consistent entry point: `runelight serve` starts the configured Host command, passes `RUNELIGHT_DEV=1`, and exposes the conventional `/runelight` route space.

Runelight reads `.g.tsx` and `.g.vue` files through the selected TypeScript Program. It does not replace your routes, providers, data layer, or framework; the adapters remain installed in your normal bundler config, and only activate Studio and preview routes in Runelight dev mode.

### The visual boundary

The preview route recreates appearance, not behavior. If components depend on app-wide CSS, design-system stylesheets, or static root selectors (theme classes, `data-*` attributes), the preview route needs those too. But it gets them through static imports and wrapper elements — not through production providers that run hooks, fetch data, or open connections.

For Next.js App Router, this means inherited layouts matter. A `/runelight` page cannot opt out of `app/layout.tsx`. If that layout mounts production shell components, the preview route will execute their hooks. The solution is route-group isolation - keep Runelight routes outside the production layout chain.

## Guarantees

This model gives Runelight a small, well-defined surface area:

**Production code.** Frames are inert static data attached to components. Production render paths do not read them. The preview runtime is separate dev-only code loaded by adapters and Studio.

For Studio canvas performance and preview pipeline notes, see [traces/2026-05-28-studio-canvas-performance-optimization.md](../traces/2026-05-28-studio-canvas-performance-optimization.md).

**Build pipeline.** Adapters plug into your existing pipeline. `runelight serve` starts the configured Host command rather than introducing a parallel bundler or second app runtime.

**Data layer.** Runelight has no opinions about fetching, caching, stores, or providers. The seam swaps state at preview time without changing how production works.

**Router.** Studio mounts at `/runelight/studio`. Preview at `/runelight`. Two routes, added and removed in one step.

**File structure.** Put files wherever you already put them.

## Exit Path

Removal is mechanical and gradual:

1. Remove `Component.frames`. Components still work — they are ordinary TSX with an ignored static property.
2. Replace `useScope()` with the underlying real hook. Components still work, behaving exactly as before.
3. Rename `.g.tsx` → `.tsx`. TypeScript still compiles. Imports update once.
4. Remove the Adapter from your build config. Your app still builds.
5. Delete the `/runelight/studio` and `/runelight` routes. Your app still runs.

What remains is what you started with: ordinary React or Vue components.
