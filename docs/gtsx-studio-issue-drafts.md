# GTSX Studio Issue Drafts

These drafts break the GTSX Studio plan into independently grabbable vertical slices. They are ordered by dependency. Replace local draft IDs such as `STUDIO-01` with real issue references when publishing to an issue tracker.

## STUDIO-01: Build static Studio manifest provider

Type: AFK

## What to build

Build a framework-neutral Studio manifest provider that scans the configured GTSX project surface and returns the static data Studio needs for navigation. The manifest should describe file groups, component exports, coordinates, cases, providers, diagnostics, route configuration, and preview URL templates without importing or executing user components.

## Acceptance criteria

- [x] A reusable manifest builder returns stable JSON for the current repository examples and fixture projects.
- [x] Manifest entries include component coordinates, component names, file grouping, export names, mode, ordered cases, providers, and analyzer diagnostics.
- [x] The manifest builder does not execute user components or include runtime props, scope, provider values, DOM rects, or child trees.
- [x] Tests cover valid entries, entries with diagnostics, multiple exports in one file, and stable ordering.

## Blocked by

None - can start immediately.

## STUDIO-02: Add project-local API route integration path

Type: AFK

## What to build

Add a tracer-bullet project integration that exposes the Studio manifest through a project-local API or server route. The route should call the official manifest provider and return static JSON at the default `/gtsx/studio/manifest` path for a framework that supports server/API routes.

## Acceptance criteria

- [x] A playground or fixture exposes `/gtsx/studio/manifest` through a project-local server/API route.
- [x] The route returns the manifest generated from the real project files.
- [x] The route uses official GTSX server helpers rather than duplicating manifest logic in the playground.
- [x] Tests or verification steps prove the route works when the project dev server is running.

## Blocked by

- STUDIO-01

## STUDIO-03: Mount Studio shell at `/gtsx/studio`

Type: AFK

## What to build

Add the first Studio app shell and mount it at `/gtsx/studio` in the tracer-bullet project integration. The shell should load the manifest, render a component index grouped by file, and show the first canvas column for the selected file group or component.

## Acceptance criteria

- [x] `/gtsx/studio` loads without requiring `gtsx serve`.
- [x] The Studio shell fetches or receives the manifest from the project-local provider.
- [x] The left sidebar shows file groups and GTSX component exports with stable labels.
- [x] Selecting a file group shows all exported GTSX components from that file in the first canvas column.
- [x] Selecting one component shows only that component in the first canvas column.

## Blocked by

- STUDIO-01
- STUDIO-02

## STUDIO-04: Render independent preview iframe cards

Type: AFK

## What to build

Render each Studio component card through an isolated preview iframe that uses the lightweight `/gtsx?entry=...&case=...` renderer. This slice should prove that Studio can display real component previews without making the preview renderer depend on Studio or on the Studio manifest.

## Acceptance criteria

- [x] Each first-column component card contains an identity header and an iframe preview.
- [x] Iframe URLs are derived from manifest coordinates and selected cases.
- [x] The lightweight preview renderer still works without loading the Studio shell or manifest.
- [x] The first statically enumerable case is selected by default.
- [x] Invalid or missing preview targets render a card-level error state instead of crashing Studio.

## Blocked by

- STUDIO-03

## STUDIO-05: Add runtime boundary tree and iframe protocol

Type: AFK

## What to build

Extend the GTSX runtime so rendered preview iframes can report GTSX boundary trees to Studio. The tree should come from the GTSX React boundary context, not from DOM nesting or static imports, and iframe communication should use a versioned `postMessage` protocol with session IDs.

## Acceptance criteria

- [x] GTSX boundaries register parent-child relationships through runtime context.
- [x] Preview iframes send `gtsx:ready`, `gtsx:tree`, `gtsx:resize`, and `gtsx:error` messages with a protocol version and session ID.
- [x] DOM rects are included as positioning metadata but are not used to infer hierarchy.
- [x] Ordinary React components and DOM nodes are not reported as drillable Studio nodes.
- [x] Tests or verification cover nested GTSX components and stale iframe session messages.

## Blocked by

- STUDIO-04

## STUDIO-06: Implement Finder-style column drilldown

Type: AFK

## What to build

Implement horizontal Finder-style component drilldown in the Studio canvas. Clicking a component card should select it and, when the current case renders direct GTSX children, create the next column with those direct child components. The drilldown axis is component hierarchy, not cases.

## Acceptance criteria

- [x] Clicking a card in column `N` discards columns to the right and creates a new `N + 1` child column when children exist.
- [x] Child columns contain direct GTSX child components from the selected card's current rendered boundary tree.
- [x] Repeated child components are merged by component coordinate in the column.
- [x] Components with no GTSX children select normally and do not create an empty drilldown column.
- [x] Non-GTSX children remain visible in preview but are not drillable.

## Blocked by

- STUDIO-05

## STUDIO-07: Add case switching in Inspector

Type: AFK

## What to build

Add Inspector case controls for the selected GTSX component. Cases should be edited outside the column axis. Changing a component's case rerenders that component's iframe and clears deeper drilldown columns because the child tree may have changed.

## Acceptance criteria

- [x] The Inspector displays ordered cases for the selected GTSX component.
- [x] Changing the selected case rerenders the selected component card.
- [x] Changing a case clears columns to the right of the changed component.
- [x] Case selection is stored per component coordinate in the current Studio workspace state.
- [x] The default case remains the first statically enumerable case when no explicit selection exists.

## Blocked by

- STUDIO-06

## STUDIO-08: Add runtime values and instances Inspector

Type: AFK

## What to build

Add Inspector support for runtime instances and value snapshots. For merged component cards, the Inspector should show instances from the current parent context. Runtime props, scope, and provider values should be requested on demand from the preview iframe and safely serialized without redaction.

## Acceptance criteria

- [ ] The Inspector shows runtime instances for merged component cards.
- [ ] Selecting an instance requests props, scope, and provider value snapshots from the relevant preview iframe.
- [ ] The serializer handles circular references, functions, symbols, dates, React elements, class instances, errors, maps, and sets.
- [ ] Functions are displayed but never executed.
- [ ] Depth and size limits prevent large values from freezing Studio.
- [ ] Runtime values are not included in the static manifest or Studio URL.

## Blocked by

- STUDIO-05
- STUDIO-06

## STUDIO-09: Persist Studio workspace state in URL

Type: AFK

## What to build

Persist enough Studio workspace state in the URL to restore a review or debugging session. The URL should capture sidebar selection, column path, selected case per component coordinate, and selected inspector node or instance, without including runtime value snapshots.

## Acceptance criteria

- [ ] Reloading a Studio URL restores the selected sidebar item and column path.
- [ ] Reloading restores selected cases for coordinates in the workspace path.
- [ ] Browser back and forward navigate previous Studio workspace states.
- [ ] Runtime props, scope, provider values, and serialized snapshots are never written to the URL.
- [ ] Invalid or stale URL state degrades to the nearest valid Studio selection with a visible warning.

## Blocked by

- STUDIO-06
- STUDIO-07

## STUDIO-10: Harden iframe layout, lazy loading, and per-card errors

Type: AFK

## What to build

Harden the Studio card rendering experience so large projects remain usable. Iframes should be lazy-loaded, default to content-height sizing where possible, support viewport presets for viewport-dependent components, and isolate render failures at card level.

## Acceptance criteria

- [ ] Cards near the visible canvas load iframes lazily with `IntersectionObserver`.
- [ ] Iframes can report content height through runtime resize messages.
- [ ] Viewport-dependent components can use fixed viewport presets instead of content-height sizing.
- [ ] A render failure in one card does not crash the Studio shell or other cards.
- [ ] Error cards show entry coordinate, case, error message or stack summary, and a copyable reproduction preview URL.

## Blocked by

- STUDIO-04
- STUDIO-05

## STUDIO-11: Update `gtsx serve` to be project-level Studio entry

Type: AFK

## What to build

Update the CLI contract so `gtsx serve` is project-level and points humans to Studio. It should not be modeled around serving one entry file, should not automatically open a browser, and should print only the Studio URL while preserving lightweight preview and capture behavior.

## Acceptance criteria

- [ ] `gtsx serve` delegates to the project preview environment and prints the configured Studio URL.
- [ ] `gtsx serve` does not automatically open a browser.
- [ ] CLI help and tests describe project-level serve semantics rather than single-entry serve semantics.
- [ ] Existing preview and capture commands continue to use lightweight preview URLs.
- [ ] Missing Studio route integration produces an actionable diagnostic.

## Blocked by

- STUDIO-03

## STUDIO-12: Write official AI installer prompt for Studio routes

Type: HITL

## What to build

Create the official AI installer prompt that guides project agents to integrate Studio through thin project-local routes. The prompt should detect the framework, prefer server/API route manifest providers, fall back to adapter virtual modules when appropriate, and avoid public-file watcher fallbacks in the MVP.

## Acceptance criteria

- [ ] The prompt explains the default `/gtsx`, `/gtsx/studio`, and `/gtsx/studio/manifest` route contract.
- [ ] The prompt tells agents to create thin project-local routes that import official GTSX client/server helpers.
- [ ] The prompt prefers server/API route manifest providers and documents virtual module fallback.
- [ ] The prompt explicitly avoids public manifest watcher fallback for MVP.
- [ ] The prompt includes verification steps for opening Studio and rendering at least one component card.

## Blocked by

- STUDIO-01
- STUDIO-02
- STUDIO-03

## STUDIO-13: Add virtual module manifest fallback for adapter-supported stacks

Type: AFK

## What to build

Add a second manifest provider path for stacks where an adapter can expose a virtual module but a project-local server/API route is unavailable or undesirable. The fallback should provide the same static manifest shape as the server route provider.

## Acceptance criteria

- [ ] An adapter-supported playground can load the Studio manifest through a virtual module.
- [ ] The virtual module returns the same manifest shape as the server route provider.
- [ ] Studio can consume either server route manifests or virtual module manifests through the same client-side interface.
- [ ] If neither provider is available, diagnostics explain that the project needs a local provider generated by the user's agent.
- [ ] Tests or verification cover provider selection order.

## Blocked by

- STUDIO-01
- STUDIO-03

