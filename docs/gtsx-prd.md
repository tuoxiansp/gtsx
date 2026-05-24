# GTSX Product PRD

## Problem Statement

Modern React/TSX components are rarely self-contained. A production component may depend on theme providers, routers, query clients, browser APIs, global CSS, assets, aliases, feature flags, framework conventions, and a project-specific execution environment. Engineers and AI agents can write a component quickly, but they often cannot open one component in a stable isolated state, switch loading/error/ready variants, capture screenshots, or diagnose failures without first discovering which TypeScript project owns that component and which host can render it.

The wrong product shape is to classify projects first as app, library, monorepo, framework, or bundler variants and then special-case each category. Those categories are symptoms, not the boundary GTSX needs. The first-order boundary is the TypeScript project: the `tsconfig` and TypeScript Program decide which source files are in scope. A separate host decides whether those files can be rendered.

GTSX takes the language-toolchain path: it defines a small production TSX case protocol on top of the selected TypeScript Program. GTSX owns authoring primitives, runtime/types, provider/scope helpers, pure TypeScript static analysis, project/scope resolution, host contracts, adapter contracts, and a thin CLI. The selected host continues to own rendering behavior, CSS, routing, assets, browser environment, and production build integration.

One-line positioning:

> GTSX is a production TSX case protocol and AI-assisted language-toolchain layer that derives component preview scope from TypeScript projects and renders that scope through a project-native, managed, or external host.

## Product Positioning

- GTSX is a standalone product for production React/TSX component preview, capture, and diagnosis.
- GTSX is not a universal frontend bundler, framework runtime, router, CSS processor, asset pipeline, app generator, or test runner.
- GTSX is not a Storybook clone. It keeps cases on production components and uses explicit GTSX state boundaries instead of creating a parallel story registry.
- GTSX's core assets are authoring protocol, runtime/types, provider/scope helpers, TypeScript Program-based scope analysis, host contracts, adapter definitions, CLI orchestration, and AI installation instructions.
- GTSX Scope follows TypeScript: the selected TypeScript Program decides which `.g.tsx` files Studio and analysis own.
- GTSX Host is parallel to scope: it renders the selected scope but does not expand it.
- GTSX should prefer an existing project-native host when one is available, and use a managed or external host when the selected TypeScript project has no renderable host of its own.
- The primary user experience is prompt-driven setup: an AI agent selects or confirms a TypeScript project, resolves the GTSX scope, checks for a usable host, installs or configures the smallest adapter/host layer, adds local GTSX instructions, and verifies the integration.

## Core Product Experience

1. A user asks an AI agent to install GTSX for a TypeScript project or workspace.
2. The agent resolves the selected TypeScript project from `-p` / `--project`, the nearest `tsconfig`, or a workspace solution config with project references.
3. The agent installs the `gtsx` package using the project's package manager.
4. GTSX derives scope from the TypeScript Program and filters that Program for `.g.tsx` files.
5. The agent checks whether the selected project already has a usable host. If it does not, the agent configures a managed GTSX host or an external host.
6. The agent selects and installs an adapter package when useful, then applies the smallest useful diff: host route, managed host config, wrappers, preview transform config, scripts, strip integration when available, and local instructions.
7. The agent runs verification and reports the exact stage of success or failure.
8. The user or agent adds `.g.tsx` cases to production component exports.
9. GTSX static analysis reads the selected TypeScript Program and verifies the case contract without recreating the host or bundler.
10. Studio lists only `.g.tsx` files in the selected GTSX Scope. The host may load additional dependencies for rendering, but those dependencies do not become Studio entries unless they are also in the selected TypeScript Program.
11. `gtsx` CLI commands call the selected host/adapter layer, and that layer calls the user's local tooling for serve, capture, watch, strip, or diagnosis.
12. Production builds continue to use the user's existing build command, with preview metadata stripped or explicitly warned about by the adapter.

## GTSX Project And Scope

A GTSX Project is a TypeScript project plus the GTSX `.g.tsx` protocol. GTSX does not define scope by package type, framework, workspace layout, or current working directory alone.

The selected TypeScript project should be resolved in this order:

1. An explicit `-p` / `--project <tsconfig-or-directory>` CLI option.
2. A `gtsx.config.ts` that points to a TypeScript project.
3. The nearest `tsconfig.json` from the current working directory.
4. A workspace or solution config that references one or more TypeScript projects.

GTSX Scope is the set of `.g.tsx` source files in the selected TypeScript Program. This means GTSX should follow TypeScript config semantics rather than reinterpreting glob strings by hand:

- `files` and `include` establish root file candidates.
- `exclude` only filters files discovered through `include`; it is not a hard isolation wall.
- Imports, `types`, triple-slash references, and explicit `files` entries can still bring files into the Program.
- Project references define multiple TypeScript projects in a workspace. Each referenced project owns its own GTSX Scope.

Single-project coordinates are relative to that project's coordinate root, normally the TypeScript project root:

```txt
src/studio/StudioShell.g.tsx#default
```

Workspace-level Studio may aggregate multiple GTSX Projects. In that case, cross-project coordinates include a project id:

```txt
gtsx:src/studio/StudioShell.g.tsx#default
@repo/ui:src/Button.g.tsx#default
```

The invariant is:

> Scope follows TypeScript. Host does not expand scope.

Studio indexes the selected GTSX Scope. A Host can import extra app shells, setup files, CSS, providers, mocks, or dependencies to render a component, but those imports do not add entries to the selected GTSX Scope.

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

## Host Environment

A Host is the execution environment that can render the selected GTSX Scope. It is not the source of component cases and it does not decide which `.g.tsx` files Studio owns. It may be a project-native app route, a generated managed Vite host, an adapter-owned route, an existing story/test harness, or an external application that can import the selected TypeScript project.

Hosts fall into three broad shapes:

- Project-native Host: the selected TypeScript project already has a dev server or route system that can expose `/gtsx` and `/gtsx/studio`.
- Managed Host: GTSX or an adapter provides a development-only host for a TypeScript project that has no renderable shell of its own.
- External Host: another project renders the selected GTSX Scope, for example a design-system package rendered inside a consuming app.

A Host is responsible for:

- Importing global CSS through the same path the host normally uses.
- Installing wrappers such as router, i18n, query client, feature flags, browser mocks, and theme providers.
- Respecting asset handling, aliases, environment variables, and browser defaults through the host's tooling.
- Declaring default viewport and browser options when the adapter supports capture.
- Providing React wrappers needed to make production components render.
- Loading the preview-only GTSX transform for the selected adapter.
- Passing root case selection and child component case overrides into the GTSX preview runtime.

It should not become a central registry for all component cases. Cases stay close to the component export they describe, and Studio indexing remains tied to the selected TypeScript Program.

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

## Host And Adapter Integration Model

GTSX integration is host-based and adapter-assisted. A Host renders the selected GTSX Scope. An Adapter is a small bridge between the GTSX protocol and a specific host or toolchain.

The core `gtsx` package should remain small: protocol, runtime, types, TypeScript Program-based analyzer, project/scope resolution, CLI, host contract, and adapter contract. Official host/toolchain support should live in independent adapter packages, for example `@gtsx/adapter-vite-react` and `@gtsx/adapter-next`.

An adapter should declare:

- `detectHost`: how to identify an existing project-native host from repo signals such as scripts, framework config, route files, Vite config, and browser-test setup.
- `installHost`: which packages, files, routes, scripts, and local instructions are required when the host needs setup.
- `previewTransform`: how `.g.tsx` exports are wrapped with GTSX component boundaries in preview and capture builds.
- `serve`: how to open Studio or preview using the selected host.
- `capture`: how to render one case or all statically enumerable cases and capture screenshots.
- `strip`: how preview metadata is removed or made unreachable in production builds.
- `diagnose`: how to classify errors from TypeScript project resolution, contract extraction, host configuration, host compilation, preview loading, case rendering, and browser capture.

Adapters may be framework-specific or host-specific, but GTSX should not grow one monolithic compatibility layer. The shared product surface is the case protocol, TypeScript Program scope model, static analyzer, runtime/types package, and CLI orchestration contract.

The first production-quality managed host may use Vite + React because it is the smallest useful slice, but the product should not be defined as Vite-only. Vite is one host implementation, not the architecture.

If an official adapter does not support a host, the AI installer may generate project-local host glue or a local transform based on the same adapter contract. That local integration should be clearly labeled, minimally scoped, and verified with `gtsx check`, Studio, preview, and capture commands.

## AI Installation Flow

The primary installation UX is a prompt, not a manual checklist.

The AI installer should:

1. Inspect the repo and explain the detected package manager, TypeScript projects, project references, scripts, and likely host strategy.
2. Install `gtsx` using the user's package manager.
3. Resolve or ask the user to confirm the selected TypeScript project when multiple projects are plausible.
4. Derive the GTSX Scope from the selected TypeScript Program and report how many `.g.tsx` files are in scope.
5. Check whether a project-native Host exists. If none exists, propose a managed or external Host.
6. Install the matching official adapter package when one is available.
7. Generate or patch the minimum files needed for the selected host and adapter.
8. If no adapter fits, attempt project-local host glue only after explaining that it is local integration work.
9. Add package scripts that use the project's local toolchain, for example `gtsx:serve`, `gtsx:capture`, `gtsx:check`, or project-conventional equivalents.
10. Install or generate local GTSX instructions so future AI agents know the project's conventions.
11. Run verification and report the exact success or failure stage.

The installer should avoid rewriting unrelated project structure. If multiple TypeScript projects, multiple plausible hosts, or unusual build constraints are detected, it should ask for confirmation before editing scripts, lockfiles, config files, or generated host entries.

## CLI And Local Toolchain

GTSX should expose a small CLI surface that feels consistent across TypeScript projects while delegating render work to the selected Host and Adapter.

```sh
gtsx init    [-p <tsconfig-or-directory>]
gtsx check   [-p <tsconfig-or-directory>] <entry.g.tsx[#export]|dir>
gtsx serve   [-p <tsconfig-or-directory>] [--port <port>]
gtsx capture [-p <tsconfig-or-directory>] <entry.g.tsx[#export]|dir> [--case <name>|--all] [--gcase <entry.g.tsx#export:case>] [--viewport 1440x900] [--out <file.png|dir>]
```

CLI responsibilities:

- Resolve the selected TypeScript project and GTSX configuration.
- Build or read the TypeScript Program and derive GTSX Scope.
- Run static contract extraction before expensive preview work.
- Invoke the selected Host and local package scripts rather than relying on bundled global tooling.
- Pass entry coordinate, root case, child case overrides, viewport, and output options into the Host/Adapter.
- Normalize diagnostics so users can tell whether a failure came from TypeScript project resolution, GTSX contract rules, host configuration, host compilation, preview loading, render code, or browser capture.

CLI non-responsibilities:

- Reimplement the user's bundler.
- Reconstruct framework-specific routing or server behavior.
- Duplicate CSS, asset, alias, or environment variable resolution.
- Guess a GTSX Scope from package type when TypeScript project resolution is ambiguous.
- Guarantee that a project can render without some configured Host.

## Static Analysis

The analyzer is contract-only and should be implemented as a pure TypeScript toolchain. It should resolve the selected TypeScript Program and source files, but it should not need to run the selected Host or bundler to answer protocol questions.

It should verify:

- The selected TypeScript project resolves to a Program.
- The GTSX Scope is derived from `.g.tsx` files in that Program.
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
- Errors are classified by stage: TypeScript project resolution, contract extraction, TypeScript diagnostics, host configuration, host compilation, preview loading, case rendering, and browser capture.

It should not try to prove arbitrary JSX structure, React branch coverage, CSS behavior, or full UI completeness.

Out of scope for static analysis:

- Extracting a full element tree from arbitrary TSX.
- Proving `if` / `switch` / ternary coverage.
- Inferring cases from runtime values.
- Running framework-specific data loaders.
- Letting a Host expand the selected GTSX Scope.
- Proving transitive hook purity inside imported opaque dependencies.
- Analyzing CSS cascade, CSS modules, Tailwind output, media queries, or CSS variables.

## Production Build Integration

Because `.g.tsx` files are production components, preview metadata must not accidentally ship.

Production behavior is host/adapter-owned. The same adapter package that owns preview transform should also own production strip responsibility when possible. Depending on the selected TypeScript project and production toolchain, stripping may be implemented through a Vite plugin, Babel/SWC transform, framework compiler hook, build-time define, package export split, or another project-native mechanism.

At minimum, the integration must have a clear answer for:

- Static `Component.cases = ...` assignments.
- Static `GProvider.cases = ...` assignments.
- Preview-only `defineGComponent(...)` wrappers introduced by adapter transforms.
- Other preview-only metadata introduced by the package.

Initial adapters may leave strip unimplemented, but they must report that explicitly during `gtsx init` and `gtsx strip --check`. If the selected adapter cannot safely strip metadata, installation and diagnostics must warn that cases may ship in the production bundle and must not contain sensitive data. This warning is acceptable for experimental adoption, but not for a production-ready adapter.

## Testing Decisions

Tests should prioritize external behavior and adapter contracts:

- A GTSX Scope can be derived from a selected TypeScript Program.
- A workspace or solution config can expose multiple GTSX Projects without merging their scopes.
- A `.g.tsx` production component can be discovered by `file#export` coordinate and rendered through component-owned cases.
- A pure component can be rendered through component cases with props and provider selections.
- A stateful component can be rendered through component cases with props, providers, and scope.
- Provider cases can be selected per component case.
- Preview transform wraps exported components so nested stateful components receive their selected local case.
- URL `gcase` overrides can select child component cases without creating a Cartesian product.
- A Host can import global CSS and wrap the preview tree through host-native tooling.
- `gtsx check` derives scope from the nearest TypeScript project by default, and `-p <project>` can select one explicitly.
- `gtsx serve` opens Studio through the selected Host without requiring a component entry.
- `gtsx capture` captures one case and all cases through the selected Host/Adapter.
- Production strip integration removes or isolates component and provider `.cases`.
- Missing component coordinates, missing cases, multiple primary GScope hooks, non-GTSX hooks, malformed cases, and missing provider cases produce useful diagnostics.
- Case render failures are localized to the failing case and distinguished from compile or environment failures.

Tests should avoid asserting internal AST traversal details unless they are part of the public contract.

Playground closure should be a Host/Adapter validation matrix. Each environment should define its own canonical install, serve, capture, build, and test entry, but the observed behavior should match the same GTSX protocol and TypeScript Program scope model.

## Out Of Scope

- Owning a universal frontend build system.
- Guaranteeing that one generated preview host can run every user project.
- Classifying scope by app/library/package shape instead of the selected TypeScript Program.
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
- Whether Host and Adapter selection should be entirely AI-driven, stored in project config, or both.
- Whether root workspace Studio should be implemented as a solution-level aggregator or as explicit multi-project selection.
- Whether `-p` should accept only `tsconfig` paths or also package/workspace directory selectors.
- Whether future versions should support static replacement of imported hooks for lower-intrusion adoption.
- Whether provider override syntax should use provider names, provider object identity, or a typed helper to avoid string keys.
- How much adapter-local AI-generated code should be promoted back into official adapter packages.
- Whether capture should always use Playwright, or reuse a project's existing e2e/browser stack when available.

## Success Criteria

GTSX succeeds if real projects can:

- Install GTSX through a prompt-driven AI flow with a small, reviewable diff.
- Select a TypeScript project and derive the same GTSX Scope that TypeScript would see.
- Keep their existing package manager, host, framework, bundler, CSS pipeline, and build scripts when those exist.
- Add GTSX metadata to production TSX component exports without changing normal runtime behavior.
- Serve those components through a project-native, managed, or external Host.
- Switch loading, error, empty, ready, theme, and other important states through typed cases.
- Capture screenshots from the same cases used for preview.
- Strip or isolate preview metadata from production builds, or receive explicit diagnostics when that is not safe.
- Diagnose failures by stage instead of collapsing TypeScript project resolution, host setup, preview, render, and capture failures into generic preview errors.
