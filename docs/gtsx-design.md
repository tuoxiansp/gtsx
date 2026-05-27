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
3. **Two seam helpers** — `createGScopeHook` for previewing stateful components, `createGProvider` for previewing context-dependent components.

None of these modify React. None change how your component renders in production. None require modifying the component's own runtime code.

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
