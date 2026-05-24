# GTSX Studio UX and Architecture

Status: proposed

GTSX Studio is the human-facing workspace for browsing and decomposing GTSX components. It is separate from the lightweight preview renderer so that AI agents, capture flows, and direct URL rendering can stay small and stable.

## Goals

- Let humans open Studio for a selected GTSX Project and see the `.g.tsx` components in that project's TypeScript Program.
- Let humans choose a file group or component and drill through the rendered GTSX component hierarchy.
- Make component composition visible without becoming a React DevTools clone.
- Keep preview and capture URL behavior lightweight and backwards compatible.
- Support project-native, managed, and external Hosts through thin generated routes or adapter-provided hooks.

## Project And Host Model

Studio indexes a GTSX Scope, not a package shape. The selected TypeScript Program decides which `.g.tsx` files Studio owns. App, library, monorepo, package, and framework categories are secondary signals for Host setup; they do not define scope.

The invariant is:

> Scope follows TypeScript. Host does not expand scope.

A Host renders the selected scope. The Host can import CSS, providers, mocks, setup files, and other runtime dependencies, but those imports do not add Studio entries unless they are also `.g.tsx` files in the selected TypeScript Program.

Single-project Studio uses coordinates relative to that project's coordinate root:

```txt
src/AppShell.g.tsx#default
```

Workspace-level Studio may aggregate multiple GTSX Projects. Cross-project coordinates must include a project id:

```txt
gtsx:src/studio/StudioShell.g.tsx#default
@repo/ui:src/Button.g.tsx#default
```

## Route Contract

Default routes:

- `/gtsx`: lightweight preview renderer.
- `/gtsx/studio`: Studio app.
- `/gtsx/studio/manifest`: Studio manifest provider when the Host supports an API or server route.

Hosts may override these routes when they conflict with an existing app route, but the defaults should be used in docs, installer prompts, and CLI output.

The preview renderer remains URL-driven:

```txt
/gtsx?entry=src/AppShell.g.tsx#default&case=ready&gcase=src/UserMenu.g.tsx#default:open
```

Studio may embed the preview renderer, but preview must not depend on Studio or on the Studio manifest.

## CLI Contract

`gtsx serve -p <project>` is GTSX Project-level. It should resolve the selected TypeScript project, start or delegate to the selected Host, and print only the Studio URL.

It should not automatically open a browser.

It should not be modeled around serving one entry file. Entry selection is a Studio concern and a preview URL concern, not the meaning of the project-level serve command.

## Installation Model

The primary install path is an official AI installer prompt, not a large universal framework generator.

Official packages should provide stable client and server building blocks, for example:

- `@gtsx/studio/client`: Studio shell.
- `@gtsx/studio/server`: manifest builder and framework-neutral helpers.
- GTSX runtime hooks for boundary tree, resize, and value reporting.

The AI installer first resolves the selected TypeScript project and then checks whether a Host already exists. If a Host exists, the installer creates thin Host-specific routes:

- A Studio page at `/gtsx/studio`.
- A manifest API/server route at `/gtsx/studio/manifest` when supported.
- A preview renderer at `/gtsx`.
- Adapter transform wiring for GTSX component boundaries.

If no Host exists, the installer configures a managed Host or asks the user to choose an external Host. The generated code should mostly import official GTSX packages and pass the selected GTSX Project and Host config. The user's agent owns the thin Host glue.

## Manifest Provider Order

Studio needs a static manifest for navigation. The manifest is only for Studio and should not affect preview.

Provider order:

1. Host-local API or server route.
2. Adapter-provided virtual module.
3. Managed Host manifest provider.
4. No automatic Studio support. The installer or user's AI agent must create or configure a Host provider.

Do not build a public-file or watcher fallback into the MVP. That path is less reliable than a Host-native provider and can pollute the project surface.

The manifest API returns static JSON only:

- version
- route configuration
- selected GTSX Project identity
- files and file groups
- component exports and coordinates
- component names
- mode: `pure` or `scope`
- cases and case order
- providers
- analyzer diagnostics
- preview URL templates

The manifest API must not import and execute user components to inspect runtime values. Props, scope, provider values, DOM rects, and child boundary trees come from the preview runtime.

## Studio Layout

Studio has three primary areas:

- Left sidebar: component index.
- Center canvas: horizontal column drilldown.
- Right inspector: selected GTSX boundary details.

The visual tone should be closer to Figma or Linear than Storybook. Use neutral chrome, a clear canvas, strong selection outlines, and low visual noise.

The center canvas supports pan and zoom. Cards are laid out by columns; users cannot drag cards to custom positions in the MVP.

## Left Sidebar

The sidebar is a component index for the selected GTSX Scope, not a raw file explorer and not a Host import graph.

Default grouping:

- Group by source file path.
- Show component name as the primary label.
- Show `path#export` as secondary detail.
- Keep stable path-based ordering.
- Surface diagnostic state.

Users can select either:

- A file group: the first canvas column shows all GTSX components exported from that file.
- A component export: the first canvas column shows only that component.

## Center Column Drilldown

The center canvas uses Finder-like column navigation, but the columns represent GTSX component hierarchy, not cases.

Column behavior:

- The first column contains root candidates from the current sidebar selection.
- Clicking a component card selects it.
- If the selected card renders direct GTSX children for its current case, the next column shows those direct child components.
- Clicking a card in column `N` discards all columns to the right and creates a new `N + 1` column.
- Browser back/forward should restore the column path from the Studio URL.

Card structure:

- Identity header: component name, coordinate, current case label.
- Preview iframe: an isolated render of that component with its selected case.

Do not include a children summary in the card. Drilldown happens by clicking cards.

Repeated child components are merged by component coordinate in the next column. The inspector shows the runtime instances for the merged component.

## Case Semantics

Cases are not part of the column axis. They are edited in the inspector.

Default case selection uses the first statically enumerable case, matching preview runtime behavior.

Each component coordinate in the current column path owns its selected case. Changing the selected component's case rerenders that component and clears deeper columns to the right because the child tree may have changed.

Studio supports both independent decomposition and context overrides:

- Column decomposition renders each column card as an independent root preview for that component coordinate and selected case.
- Context inspection can still use `gcase` in a parent preview iframe to view a child component state inside the parent layout.

## GTSX Boundary Scope

Studio only drills into GTSX component boundaries.

It must not try to inspect ordinary React components, DOM nodes, or third-party components. Non-GTSX children remain rendered inside the preview but are opaque to Studio.

The boundary tree is generated by GTSX runtime context, not DOM nesting or static imports. Each `defineGComponent` boundary registers itself with its nearest GTSX boundary parent. DOM rects are additional positioning data only.

## Preview Iframes

Studio renders real components in iframes through the selected Host to isolate CSS, route behavior, and render failures from the Studio shell.

Iframe sizing uses a hybrid policy:

- Default: auto-size to content height using runtime measurement and `ResizeObserver`.
- Viewport-dependent components: use a fixed viewport preset such as phone, tablet, or desktop.

The runtime reports resize events to Studio. Components with `100vh`, fixed positioning, portals, virtual lists, or unstable animation layout may need a fixed preset.

Iframes are lazy-loaded with `IntersectionObserver`. The MVP should not render every iframe in large columns at once, and it should not require thumbnail caching.

## Inspector

The right inspector serves the selected GTSX boundary.

Core sections:

- Identity: coordinate, file, export, component name, mode.
- Cases: selected case control for the current component.
- Instances: runtime instances for merged component cards, including DOM rect and parent path.
- Values: runtime props, scope, and provider value snapshots for the selected instance.
- Composition: current parent path and direct GTSX children.
- Actions: copy Studio URL, copy preview URL, copy capture command.

Runtime values are dev-only and should not be redacted. They must still be safely serialized:

- Do not execute functions.
- Display function names or signatures when possible.
- Handle circular references.
- Handle symbols, dates, React elements, class instances, errors, maps, and sets.
- Enforce depth and size limits so Studio cannot freeze on large objects.

Runtime values are never stored in the URL or in the static manifest.

## Iframe Communication

Studio and preview iframes communicate with a versioned `postMessage` protocol.

Messages should include a `sessionId` so async messages from old iframes do not corrupt the current column state.

Initial message set:

- `gtsx:ready`
- `gtsx:tree`
- `gtsx:resize`
- `gtsx:select-boundary`
- `gtsx:request-values`
- `gtsx:values`
- `gtsx:error`

Boundary tree messages are lightweight and can be sent for all rendered GTSX boundaries. Full props/scope/provider value snapshots are requested on demand for the selected node or instance.

## URL State

Studio URLs should restore the workspace state:

- selected sidebar item
- column path
- selected case per component coordinate
- selected inspector node or instance
- viewport or sizing preset when relevant

URLs must not include runtime value snapshots.

## Error Handling

Analyzer diagnostics should not block Studio from opening. Invalid entries appear as diagnostic nodes in the sidebar and as error cards in the canvas.

Render failures are isolated per card. A failing component should not crash the Studio shell or the rest of the column.

The selected error card should expose:

- entry coordinate
- case
- error message and stack summary
- copyable preview URL for reproduction

Only TypeScript project resolution failure, Host configuration failure, missing Studio route integration, or dev server startup failure should prevent Studio from loading.

## Capture Relationship

`gtsx capture` should always use the lightweight preview renderer, not Studio.

Studio may expose a "capture this state" action, but that action should generate a preview URL or command for the selected component state. The capture artifact should be the component preview, not the Studio UI.

## MVP Scope

MVP includes:

- fixed default routes with config override
- selected GTSX Project scope derived from TypeScript
- Host-local server route manifest provider first
- virtual module manifest provider second
- managed Host manifest provider when no project-native Host exists
- official AI installer prompt for thin project routes
- static Studio manifest JSON
- left component index with file grouping
- horizontal column drilldown
- independent iframe cards with hybrid sizing
- iframe lazy loading
- right inspector with identity, case switching, instances, runtime values, composition, and actions
- GTSX-only boundary tree via runtime context
- versioned `postMessage` protocol
- URL restoration
- per-card error handling

MVP excludes:

- ordinary React component inspection
- DOM node inspection
- Host imports expanding GTSX Scope
- free card positioning
- visual diffing
- screenshot thumbnail cache
- public manifest watcher fallback
- manifest-time component execution
- capturing Studio itself
