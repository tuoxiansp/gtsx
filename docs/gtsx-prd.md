# GTSX Product PRD

## Problem Statement

Modern React/TSX components are rarely self-contained. A production component may depend on theme providers, routers, query clients, browser APIs, global CSS, assets, aliases, feature flags, framework conventions, and a project-specific bundler. Engineers and AI agents can write a component quickly, but they often cannot open one component in a stable isolated state, switch loading/error/ready variants, capture screenshots, or diagnose failures without running the whole application.

The wrong product shape is to build a universal preview/build toolchain and then keep adding compatibility work for every frontend stack. Frontend projects are too diverse. A single external runtime cannot reliably duplicate every user's framework, CSS pipeline, asset handling, server behavior, and TypeScript setup.

GTSX takes the opposite path: it defines a small production TSX case protocol and integrates with the user's own local toolchain. GTSX owns authoring primitives, runtime/types, provider/scope helpers, pure TypeScript static analysis, adapter contracts, and a thin CLI. The user's project continues to own bundling, dev server behavior, CSS, routing, assets, and production build.

One-line positioning:

> GTSX is a production TSX case protocol and AI-assisted project integration layer that lets real React components carry typed, externally controllable preview states without replacing the user's existing frontend toolchain.

## Product Positioning

- GTSX is a standalone product for production React/TSX component preview, capture, and diagnosis.
- GTSX is not a universal frontend bundler, framework runtime, router, CSS processor, asset pipeline, or test runner.
- GTSX is not a Storybook clone. It keeps cases on production components and uses explicit GTSX state boundaries instead of creating a parallel story registry.
- GTSX's core assets are authoring protocol, runtime/types, provider/scope helpers, static contract analysis, adapter definitions, CLI orchestration, and AI installation instructions.
- GTSX should prefer project-native tooling over generated external hosts whenever possible.
- The primary user experience is prompt-driven installation: an AI agent recognizes the project, installs the package, selects an official adapter package when possible, adds minimal scripts/config, installs local GTSX instructions, and verifies the integration.

## Core Product Experience

1. A user asks an AI agent to install GTSX in an existing frontend project.
2. The agent detects the package manager, framework, bundler, TypeScript config, dev/build/test scripts, CSS entry points, and any existing preview or browser-test tooling.
3. The agent installs the `gtsx` package using the project's package manager.
4. The agent selects and installs an adapter package, then applies the smallest useful diff: preview entry, wrappers, preview transform config, scripts, strip integration when available, and local instructions.
5. The agent runs verification and reports the exact stage of success or failure.
6. The user or agent adds `.g.tsx` cases to production component exports.
7. GTSX static analysis reads the project's `tsconfig` and verifies the case contract without recreating the bundler.
8. `gtsx` CLI commands call the selected adapter, and the adapter calls the user's local tooling for serve, capture, watch, strip, or diagnosis.
9. Production builds continue to use the user's existing build command, with preview metadata stripped or explicitly warned about by the adapter.

## Authoring Contract

### Production Component

A `.g.tsx` file exports production React components, not preview-only story wrappers. The application can import and render them normally.

Each exported GTSX component has a stable coordinate:

```txt
relative/path/to/File.g.tsx#exportName
```

The default export uses `#default`. A file may contain multiple named exported components with their own cases, as long as their coordinates are unique.

All main cases live on the component export as `Component.cases`. GScope hooks do not own cases; they declare state injection points that consume the active component case in preview runtime.

Stateful components should use exactly one primary GScope hook. In production runtime, the wrapped hook delegates to the real application hook. In preview runtime, it returns the active component case's `scope`.

```tsx
import {
  createGScope,
  useGContext,
  type GCases,
  type GProviderCases,
} from "gtsx"

export type Props = {
  userId: string
}

export type ThemeScope = {
  mode: "light" | "dark"
  accent: string
}

export type Scope =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry: () => void }
  | { status: "ready"; title: string; onOpen: () => void }

export function ThemeGProvider(props: {
  value?: ThemeScope
  children: React.ReactNode
}) {
  return <ThemeProvider value={props.value}>{props.children}</ThemeProvider>
}

ThemeGProvider.cases = {
  light: { value: { mode: "light", accent: "#9f3a2f" } },
  dark: { value: { mode: "dark", accent: "#f2a06f" } },
} satisfies GProviderCases<ThemeScope>

function useRealUserCardScope(props: Props, theme: ThemeScope): Scope {
  return useUserCardScope(props.userId, theme)
}

const useUserCardGScope = createGScope(useRealUserCardScope)

export default function UserCard(props: Props) {
  const theme = useGContext(ThemeGProvider)
  const scope = useUserCardGScope(props, theme)

  if (scope.status === "loading") return <CardSkeleton />
  if (scope.status === "error") {
    return <ErrorCard message={scope.message} onRetry={scope.onRetry} />
  }

  return <ReadyCard title={scope.title} onOpen={scope.onOpen} />
}

UserCard.cases = {
  loading: {
    props: { userId: "user_1" },
    providers: { ThemeGProvider: "light" },
    scope: { status: "loading" },
  },
  error: {
    props: { userId: "user_1" },
    providers: { ThemeGProvider: "dark" },
    scope: {
      status: "error",
      message: "Could not load user.",
      onRetry: () => {},
    },
  },
  ready: {
    props: { userId: "user_1" },
    providers: { ThemeGProvider: "light" },
    scope: {
      status: "ready",
      title: "Ada Lovelace",
      onOpen: () => {},
    },
  },
} satisfies GCases<Props, Scope, [typeof ThemeGProvider]>
```

### Pure Component Exception

Pure components do not need a GScope hook. They declare component-level cases with `props` and optional provider selections. Pure components may call `useGContext`, but they must not call a GScope hook and their cases must not contain `scope`.

```tsx
import type { GCases } from "gtsx"

export type BadgeProps = {
  tone: "neutral" | "warning"
  label: string
}

export default function Badge(props: BadgeProps) {
  return <span data-tone={props.tone}>{props.label}</span>
}

Badge.cases = {
  neutral: { props: { tone: "neutral", label: "Ready" } },
  warning: { props: { tone: "warning", label: "Needs review" } },
} satisfies GCases<BadgeProps>
```

### GTSX Hook Boundary

GTSX owns the hook surface for `.g.tsx` components. An exported GTSX component and same-file helper functions or helper hooks in its render path must not call non-GTSX hooks.

Allowed hooks:

- `useGContext(Provider)` for GTSX provider context.
- A primary GScope hook returned by `createGScope(useRealScope)`.

Disallowed hooks include React hooks, third-party hooks, and user-defined hooks that are not created by `createGScope`, for example `useState`, `useReducer`, `useRef`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useTransition`, `useQuery`, `useForm`, `useRouter`, or `useMyCustomHook`.

The production scope implementation passed to `createGScope` is the escape hatch for real application behavior. It may delegate to ordinary application hooks, but the GScope wrapper must not execute it in preview runtime when an active component case provides `scope`.

Imported components are opaque dependencies in the first implementation. If an imported child component's state matters to preview, it should be exported from a `.g.tsx` file with its own cases so the preview adapter can wrap it as a GTSX component boundary.

### Cases

- Component cases are the single main preview axis for both pure and stateful components.
- Stateful component cases include `props`, optional `providers`, and `scope`.
- Pure component cases include `props` and optional `providers`.
- GScope hooks do not have `.cases`.
- Provider cases live on provider components.
- Case keys must be statically enumerable object literal keys.
- Case values are live JavaScript values. They may include functions, mock callbacks, dates, class instances, imported fixtures, or project-specific test doubles.
- Case values do not need to be JSON serializable.
- Dynamic case generation, computed keys, spread-heavy case composition, and async case loading are out of scope for the first implementation.
- Cases are preview metadata. They must not contain production secrets, credentials, customer data, or non-public tokens.

When a component is rendered as the root preview target, its selected case supplies `props`, provider selections, and `scope` when present.

When a component is rendered as a child inside another preview, its selected case may supply provider selections and `scope`, but it must not override the actual props passed by the parent render. This keeps composed previews faithful to the parent component while still allowing the environment to control child component state.

### GScope Hook

- `createGScope(useRealScope)` is called at module top level.
- The returned hook is called by the component like a normal React hook.
- In production runtime it delegates to `useRealScope`.
- In GTSX preview runtime it returns the nearest active component case's `scope`.
- An exported stateful component may have exactly one primary GScope hook.
- If multiple primary GScope hooks are detected in one exported component, the analyzer should report a clear contract error.

Future work may explore preview-time static replacement of imported hooks for lower-intrusion adoption. The first stable contract should prefer explicit higher-order hook wrapping because it makes runtime behavior auditable.

### Provider

A GTSX provider is a React provider component with normal production provider semantics and preview cases attached as metadata.

- Provider cases live on the provider component as a static `.cases` object.
- `useGContext(Provider)` reads the provider value using normal provider semantics.
- In preview runtime, the active case can select a provider case or override provider value.
- In production runtime, provider behavior should match normal React provider behavior.
- Provider cases are preview metadata and should be stripped or isolated from production builds.

Provider cases do not automatically form a Cartesian product with component cases. Component cases are the main axis. Each component case may select provider variants or provide provider overrides. Missing provider selection uses the provider default case.

## Preview Environment

A preview environment is a project-level shell, not the source of component cases. It may be a generated `gtsx.preview.tsx`, an adapter-owned route, an existing story/test harness, or a framework-specific preview entry.

It is responsible for:

- Importing global CSS through the same path the project normally uses.
- Installing project-level wrappers such as router, i18n, query client, feature flags, browser mocks, and theme providers.
- Respecting project asset handling, aliases, environment variables, and browser defaults through the user's tooling.
- Declaring default viewport and browser options when the adapter supports capture.
- Providing environment-level React wrappers needed to make production components render.
- Loading the preview-only GTSX transform for the selected adapter.
- Passing root case selection and child component case overrides into the GTSX preview runtime.

It should not become a central registry for all component cases. Cases stay close to the component export they describe.

### Preview-Only Component Boundary Transform

Stateful child components require a component-local active case context. React runtime does not expose the currently rendering export, so adapters must install a preview-only transform that wraps `.g.tsx` component exports.

Author code:

```tsx
export function NotificationBell(props: BellProps) {
  const scope = useNotificationBellScope(props)
  return <Bell unread={scope.unread} />
}

NotificationBell.cases = {
  empty: { props: {}, scope: { unread: 0 } },
  unread: { props: {}, scope: { unread: 5 } },
} satisfies GCases<BellProps, BellScope>
```

Preview-transformed shape:

```tsx
function NotificationBellImpl(props: BellProps) {
  const scope = useNotificationBellScope(props)
  return <Bell unread={scope.unread} />
}

export const NotificationBell = defineGComponent(
  "src/NotificationBell.g.tsx#NotificationBell",
  NotificationBellImpl,
)

NotificationBell.cases = {
  empty: { props: {}, scope: { unread: 0 } },
  unread: { props: {}, scope: { unread: 5 } },
}
```

`defineGComponent` is adapter/runtime infrastructure, not an author-facing API. It selects the active case for that component coordinate and provides it to nested GTSX hooks through a local runtime context.

### Case Selection URL

Preview URLs should support a root component case and zero or more child component case overrides:

```txt
?entry=src/AppShell.g.tsx#default
&case=ready
&gcase=src/NotificationBell.g.tsx#NotificationBell:unread
&gcase=src/UserMenu.g.tsx#default:open
```

- `entry` selects the root component coordinate. Omitting `#exportName` means `#default`.
- `case` selects the root component case.
- Each `gcase` selects a case for a component coordinate anywhere in the rendered subtree.
- If a child component is not specified, the preview runtime uses that component's first statically enumerable case.
- Child component case selection must not create a Cartesian product. It is a set of explicit overrides applied during one root render.

## Project Integration Model

GTSX integration is adapter-based. An adapter is a small contract between the GTSX protocol and a user's existing project toolchain.

The core `gtsx` package should remain small: protocol, runtime, types, analyzer, CLI, and adapter contract. Official toolchain support should live in independent adapter packages, for example `@gtsx/adapter-vite-react` and `@gtsx/adapter-next`.

An adapter should declare:

- `detect`: how to identify the stack from repo signals such as `package.json`, lockfile, framework config, tsconfig, scripts, and source layout.
- `install`: which packages, files, scripts, and local instructions are required.
- `previewTransform`: how `.g.tsx` exports are wrapped with GTSX component boundaries in preview and capture builds.
- `serve`: how to open a preview using the project's dev server, preview server, route system, story environment, or test harness.
- `capture`: how to render one case or all statically enumerable cases and capture screenshots.
- `strip`: how preview metadata is removed or made unreachable in production builds.
- `diagnose`: how to classify errors from contract extraction, TypeScript, bundler compilation, preview environment loading, case rendering, and browser capture.

Adapters may be framework-specific, but GTSX should not grow one monolithic compatibility layer. The shared product surface is the case protocol, static analyzer, runtime/types package, and CLI orchestration contract.

The first production-quality adapter may target Vite + React because it is the smallest useful slice, but the product should not be defined as Vite-only. Vite is an adapter, not the architecture.

If an official adapter does not support an older or unusual project, the AI installer may generate a project-local adapter or transform based on the same adapter contract. That local integration should be clearly labeled, minimally scoped, and verified with `gtsx check`, preview, and capture commands.

## AI Installation Flow

The primary installation UX is a prompt, not a manual checklist.

The AI installer should:

1. Inspect the repo and explain the detected package manager, framework, bundler, tsconfig, scripts, and likely preview strategy.
2. Install `gtsx` using the user's package manager.
3. Install the matching official adapter package when one is available.
4. Generate or patch the minimum files needed for the selected adapter.
5. If no adapter fits, attempt a project-local adapter implementation only after explaining that it is local integration work.
6. Add package scripts that use the project's local toolchain, for example `gtsx:serve`, `gtsx:capture`, `gtsx:check`, or project-conventional equivalents.
7. Install or generate local GTSX instructions so future AI agents know the project's conventions.
8. Run the adapter's verification command and report the exact success or failure stage.

The installer should avoid rewriting unrelated project structure. If multiple plausible stacks are detected, or if the project has unusual build constraints, it should ask for confirmation before editing scripts, lockfiles, config files, or generated preview entries.

## CLI And Local Toolchain

GTSX should expose a small CLI surface that feels consistent across projects while delegating real work to the selected adapter and the project's local commands.

```sh
gtsx init
gtsx check   <entry.g.tsx[#export]>
gtsx serve   <entry.g.tsx[#export]> [--case <name>] [--gcase <entry.g.tsx#export:case>] [--port <port>]
gtsx capture <entry.g.tsx[#export]> [--case <name>] [--gcase <entry.g.tsx#export:case>] [--viewport 1440x900] [--out <file.png>]
```

CLI responsibilities:

- Find the project root and selected adapter configuration.
- Run static contract extraction before expensive preview work.
- Invoke the local package manager and local project scripts rather than relying on bundled global tooling.
- Pass entry coordinate, root case, child case overrides, viewport, and output options into the adapter.
- Normalize diagnostics so users can tell whether a failure came from GTSX contract rules, TypeScript, the user's bundler, the preview environment, render code, or browser capture.

CLI non-responsibilities:

- Reimplement the user's bundler.
- Reconstruct framework-specific routing or server behavior.
- Duplicate CSS, asset, alias, or environment variable resolution.
- Guarantee that a project can run without its own install/build/dev scripts.

## Static Analysis

The analyzer is contract-only and should be implemented as a pure TypeScript toolchain. It should read the user's `tsconfig` and source files, but it should not need to run the user's bundler to answer protocol questions.

It should verify:

- The requested entry coordinate resolves to a default or named React component export.
- A `.g.tsx` file may expose multiple component coordinates.
- Component cases are statically enumerable object literals.
- Stateful component cases include `scope`.
- Pure component cases do not include `scope`.
- Exported stateful components call exactly one primary GScope hook.
- Exported GTSX components and same-file helper render paths do not call non-GTSX hooks.
- Provider cases are statically enumerable object literals.
- `satisfies` type helpers connect props, optional scope, and providers.
- Case names, missing cases, missing props, missing provider variants, and type mismatches produce clear diagnostics where TypeScript exposes enough information.
- Child case override coordinates and case names resolve to known component cases.
- Errors are classified by stage: contract extraction, TypeScript, adapter configuration, project compilation, preview environment loading, case rendering, and browser capture.

It should not try to prove arbitrary JSX structure, React branch coverage, CSS behavior, or full UI completeness.

Out of scope for static analysis:

- Extracting a full element tree from arbitrary TSX.
- Proving `if` / `switch` / ternary coverage.
- Inferring cases from runtime values.
- Running framework-specific data loaders.
- Proving transitive hook purity inside imported opaque dependencies.
- Analyzing CSS cascade, CSS modules, Tailwind output, media queries, or CSS variables.

## Production Build Integration

Because `.g.tsx` files are production components, preview metadata must not accidentally ship.

Production behavior is adapter-owned. The same adapter package that owns preview transform also owns production strip responsibility. Depending on the project stack, stripping may be implemented through a Vite plugin, Babel/SWC transform, framework compiler hook, build-time define, package export split, or another project-native mechanism.

At minimum, the integration must have a clear answer for:

- Static `Component.cases = ...` assignments.
- Static `GProvider.cases = ...` assignments.
- Preview-only `defineGComponent(...)` wrappers introduced by adapter transforms.
- Other preview-only metadata introduced by the package.

Initial adapters may leave strip unimplemented, but they must report that explicitly during `gtsx init` and `gtsx strip --check`. If the selected adapter cannot safely strip metadata, installation and diagnostics must warn that cases may ship in the production bundle and must not contain sensitive data. This warning is acceptable for experimental adoption, but not for a production-ready adapter.

## Testing Decisions

Tests should prioritize external behavior and adapter contracts:

- A `.g.tsx` production component can be discovered by `file#export` coordinate and rendered through component-owned cases.
- A pure component can be rendered through component cases with props and provider selections.
- A stateful component can be rendered through component cases with props, providers, and scope.
- Provider cases can be selected per component case.
- Preview transform wraps exported components so nested stateful components receive their selected local case.
- URL `gcase` overrides can select child component cases without creating a Cartesian product.
- A preview environment can import global CSS and wrap the preview tree through project-native tooling.
- `gtsx check` reports contract diagnostics without invoking the bundler.
- `gtsx serve` opens a case switcher for statically enumerable cases through the selected adapter.
- `gtsx capture` captures one case and all cases through the selected adapter.
- Production strip integration removes or isolates component and provider `.cases`.
- Missing component coordinates, missing cases, multiple primary GScope hooks, non-GTSX hooks, malformed cases, and missing provider cases produce useful diagnostics.
- Case render failures are localized to the failing case and distinguished from compile or environment failures.

Tests should avoid asserting internal AST traversal details unless they are part of the public contract.

Playground closure should be an adapter validation matrix. Each environment should define its own canonical install, serve, capture, build, and test entry, but the observed behavior should match the same GTSX protocol.

## Out Of Scope

- Owning a universal frontend build system.
- Guaranteeing that one generated preview host can run every user project.
- Rebuilding Storybook.
- Serializing live case values across process boundaries.
- Automatically generating complete cases from arbitrary component code.
- Proving full UI branch coverage for ordinary TSX.
- Making provider cases or child component cases form an automatic Cartesian product with component cases.
- Supporting multiple primary GScope hooks in a single exported component.
- Directly injecting state into ordinary React, third-party, or user-defined hooks.
- Proving hook purity through every transitive imported component.
- Guaranteeing cross-platform output from `.g.tsx`.

## Open Questions

- Whether `.g.tsx` should remain the only recommended filename convention, or whether normal `.tsx` files with GTSX metadata should also be accepted.
- Whether adapter selection should be entirely AI-driven, stored in project config, or both.
- Whether future versions should support static replacement of imported hooks for lower-intrusion adoption.
- Whether provider override syntax should use provider names, provider object identity, or a typed helper to avoid string keys.
- How much adapter-local AI-generated code should be promoted back into official adapter packages.
- Whether capture should always use Playwright, or reuse a project's existing e2e/browser stack when available.

## Success Criteria

GTSX succeeds if real projects can:

- Install GTSX through a prompt-driven AI flow with a small, reviewable diff.
- Keep their existing package manager, framework, bundler, CSS pipeline, and build scripts.
- Add GTSX metadata to production TSX component exports without changing normal runtime behavior.
- Serve those components through a project-native preview path.
- Switch loading, error, empty, ready, theme, and other important states through typed cases.
- Capture screenshots from the same cases used for preview.
- Strip or isolate preview metadata from production builds, or receive explicit diagnostics when that is not safe.
- Diagnose failures by stage instead of collapsing all failures into generic preview errors.
