# gtsx Design

Understand why gtsx is safe to adopt and trivial to remove.

This document is for the engineer who is evaluating gtsx — whether for a new project or an existing one. It explains the mental model, proves safety, and shows the exit path.

For the type-level contract and branch coverage rules, see [Static Contract](./gtsx-static-contract.md). For the design workspace, see [Design Workspace](./gtsx-design-workspace.md).

---

## The Formula

```
gtsx = your TSX + a small protocol
```

A `.g.tsx` file is a real TypeScript React component. Your compiler reads it. Your bundler reads it. Your tests run it. If gtsx vanished tomorrow, you would still have working TSX.

The protocol adds three things. All optional. All additive:

1. **A naming convention.** The `.g.tsx` extension marks participating files.
2. **A static export.** `Component.cases` declares the component's visual states.
3. **Two seam helpers.** `createGScopeHook` lets you preview stateful components. `createGProvider` lets you preview context-dependent components.

None of these modify React. None change how your component renders in production.

## The Model

Four primitives. No more.

| Primitive | What it is |
|-----------|-----------|
| **gtsx Project** | Your TypeScript project + the `.g.tsx` protocol |
| **gtsx Scope** | The `.g.tsx` files in your selected TypeScript Program |
| **Host** | Your framework runtime — Next.js, Vite, or anything else |
| **Adapter** | The thin shim that mounts gtsx preview inside your Host |

The invariant:

> Scope follows TypeScript. Host does not expand Scope.

Whatever your TypeScript Program already contains is what gtsx knows about. gtsx decides nothing about your project shape, folder layout, monorepo boundaries, or build configuration.

One more concept worth naming: **the seam**. This is the single boundary where preview differs from production. In production, a scope hook calls your real hook. In preview, the same scope hook returns the case-supplied value instead. The component itself never branches on "am I in preview?" — the substitution happens above it, at the seam.

## How It Works

### Production

A `.g.tsx` component in production is identical to any other React component:

```tsx
const useScope = createGScopeHook(useRealCounterScope)

export default function Counter(props: Props) {
  const scope = useScope(props)
  return <button onClick={scope.increment}>{scope.count}</button>
}

Counter.cases = { /* ... */ }
```

What happens at runtime:

- `useScope(props)` calls `useRealCounterScope(props)`. Full stop.
- `Counter.cases` is a static property on a function. Nothing in your app reads it.
- The preview runtime is not loaded. Not in your bundle.

Cases are inert data. They cannot execute, cannot leak network calls, cannot break your app.

### Preview

In Studio, a substitution happens at the seam:

- `useScope()` returns the case-supplied `scope` instead of the real hook.
- Provider entries in the case replace the real provider state.
- The render path is the same component, the same TSX, the same React.

One boundary. One well-defined difference. Everything else is shared.

## Architecture

gtsx is a sidecar, not a wrapper:

```
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

Your app and the sidecar share the same Host because that is the cheapest way to render your real components in your real environment. They do not share ownership of anything else.

The sidecar reads `.g.tsx` files through the TypeScript Program. It does not modify your routes, your providers, your data layer, or your bundler config — it only registers two preview routes.

### The visual boundary

The preview route recreates appearance, not behavior. If components depend on app-wide CSS, design-system stylesheets, or static root selectors (theme classes, `data-*` attributes), the preview route needs those too. But it gets them through static imports and wrapper elements — not through production providers that run hooks, fetch data, or open connections.

For Next.js App Router, this means inherited layouts matter. A `/gtsx` page cannot opt out of `app/layout.tsx`. If that layout mounts production shell components, the preview route will execute their hooks. The solution is route-group isolation — keep gtsx routes outside the production layout chain.

## Guarantees

**Your production code is unchanged.** Cases are inert static data. The preview runtime is separate code loaded only by Studio. No production path reads cases. No bundle ships them.

**Your build stays yours.** Adapters plug into your existing pipeline. There is no parallel bundler, no second dev server, no configuration to keep in sync.

**Your data layer is untouched.** gtsx has no opinions about fetching, caching, stores, or providers. The seam lets you swap state at preview time without changing how production works.

**Your router is untouched.** Studio mounts at `/gtsx/studio`. Preview at `/gtsx`. You add these routes; you can remove them.

**Your file structure is untouched.** Put files wherever you already put them.

## Easy Exit

If you decide gtsx is not for you, removal is mechanical and gradual. No proprietary format, no data migration, no schema to unwind.

1. Remove `Component.cases`. Components still work — they are ordinary TSX with an ignored static property.
2. Replace `useScope()` with the underlying real hook. Components still work, behaving exactly as before.
3. Rename `.g.tsx` → `.tsx`. TypeScript still compiles. Imports update once.
4. Remove the Adapter from your build config. Your app still builds.
5. Delete the `/gtsx/studio` and `/gtsx` routes. Your app still runs.

What remains is what you started with: ordinary TypeScript React components.
