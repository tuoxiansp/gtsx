# RFC 0001: Standardizing the `.g` Protocol Across Languages

- Status: **Draft — open for discussion**
- Discussion: tracking issue / this PR
- Authors: Runelight maintainers
- Created: 2026-06-09

## Summary

Today the `.g` protocol is specified implicitly by two TypeScript implementations (`.g.tsx` for React, `.g.vue` for Vue SFC) and a TypeScript-typed Studio manifest. This RFC proposes splitting the protocol into explicit, versioned specification layers so that any UI language — Flutter/Dart, SwiftUI, Jetpack Compose, and others — can participate: a tool analyzes `.g`-conformant source and emits one **standardized, language-neutral structure** that external tools (Studio, CI checkers, capture services, agents via MCP, design tools) can consume without knowing the host language.

This is a first draft meant to be argued with, not a finished spec.

## Motivation

1. **The protocol is bigger than React/Vue.** The core ideas — declared visual states, stable component coordinates, substitution seams, static verifiability — are not TypeScript ideas. Flutter widgets, SwiftUI views, and Compose composables all have props-like inputs, ambient context, and internal state that a preview must substitute.
2. **External tools need one contract.** Today consumers effectively depend on `@runelight/core` TypeScript types. A Dart analyzer cannot import those. The interchange format must be defined by a schema, not by a package.
3. **The current manifest mixes layers.** `StudioManifest` interleaves protocol data (files, components, frames, providers, diagnostics) with Runelight workspace concerns (preview URL templates, serve session identity, design-board entries, cache namespace). Standardization requires separating "what the protocol says about the source" from "what one particular workspace does with it".
4. **Agents are the primary writers.** A standardized structure is what lets any agent toolchain reason about UI states uniformly: enumerate states, render one, verify coverage — regardless of the underlying framework.

## Non-Goals

- Standardizing Studio's UI, the design workspace, or the CLI surface.
- Defining how previews are *implemented* per framework (that stays binding-specific).
- Requiring every binding to support every capability from day one (see conformance levels).
- Replacing the existing React/Vue bindings; they become the reference implementations.

## Current State (what is implicitly specified today)

From the existing implementation:

- **Participation**: files named `*.g.tsx` / `*.g.vue`.
- **Coordinates**: `<project-relative-path>#<exportName>`, e.g. `src/Badge.g.tsx#default`.
- **Frames**: statically enumerable object literals; React fields `props` / `scope` / `providers`, Vue fields `props` / `scope` / `provide`.
- **Seams**: React `createGScopeHook` / `createGProvider` / `useGContext`; Vue template-scope injection and native `provide`/`inject` with `defineGInjectionKey`.
- **Variant axes**: `variants` declarations plus `GProviderFrame` / `GVueProvideFrame` markers.
- **Manifest**: `StudioManifest { version: 1, routes, preview, files[], design?, diagnostics, … }` with `frames: { kind, name, providers?, providerVariants? }` — names and coverage metadata only; frame *values* stay in source and are realized by the binding at render time.
- **Diagnostics**: flat kebab-case codes (`uncovered-jsx-branch`, `opaque-vue-template-control-flow`, …), error/warning severity.

These are good bones. The proposal below mostly names, layers, and versions what already exists.

## Proposed Architecture: Four Specification Layers

```
┌────────────────────────────────────────────────────────┐
│ G-Model        abstract concepts, language-neutral     │
├────────────────────────────────────────────────────────┤
│ G-Manifest     versioned JSON interchange format       │
├────────────────────────────────────────────────────────┤
│ G-Bindings     per-language source conventions         │
│                tsx | vue-sfc | dart | swiftui | …      │
├────────────────────────────────────────────────────────┤
│ G-Conformance  capability levels L0–L4 + test suite    │
└────────────────────────────────────────────────────────┘
```

### Layer 1: G-Model (abstract concepts)

| Concept | Definition (language-neutral) |
| --- | --- |
| **Source Unit** | A file participating in the protocol, marked by the `.g.<ext>` naming convention. |
| **Component Entry** | A renderable component exposed by a Source Unit, addressed by a Coordinate. |
| **Coordinate** | `<unit-path> "#" <entry-name>`. `unit-path` is project-root-relative with `/` separators. `entry-name` is binding-defined (TS export name or `default`; a Dart class name; a Swift type name). |
| **Frame** | A named, statically enumerable declaration of one meaningful visual state. |
| **State Slot** | A category of state a Frame can supply. Canonical slots: `props` (public inputs), `scope` (seam-substituted internal state), `context` (ambient environment entries as `[contextRef, value]` pairs). |
| **Seam** | A named boundary where preview substitutes a State Slot without executing the production state acquisition path. |
| **Variant Axis** | A finite, declared set of named environment states on a context (theme, role, locale, auth, platform) that frames can mark coverage against. |
| **Diagnostic** | A namespaced code + severity + location describing a protocol violation or coverage gap. |

Normalization note: the canonical `context` slot absorbs the current React `providers` and Vue `provide` divergence. Bindings keep their native field names in source; the manifest reports the canonical slot. Flutter `InheritedWidget`, SwiftUI `Environment`, and Compose `CompositionLocal` all map onto `context`.

Invariants every binding must preserve:

1. A Source Unit remains a **valid, ordinary source file** of its host language; the protocol is additive.
2. Frame declarations are **inert in production** — no runtime cost, no bundle inclusion requirement.
3. Frames are **statically enumerable**: a consumer can list frame names without executing application code.
4. The **exit path is mechanical**: removing protocol artifacts yields plain host-language code.

### Layer 2: G-Manifest (the standardized structure external tools consume)

A versioned JSON document defined by a published JSON Schema. Sketch:

```jsonc
{
  "gManifestVersion": "2.0",            // schema version (this RFC bumps from today's implicit v1)
  "protocolVersion": "1.0",             // G-Model semantics version
  "project": { "root": ".", "namespace": "my-app" },
  "capabilities": ["enumerate", "render", "substitute", "verify", "axes"],
  "units": [
    {
      "path": "src/UserCard.g.tsx",
      "binding": "tsx@1",               // which binding produced this unit, versioned
      "sourceHash": "…",
      "entries": [
        {
          "coordinate": "src/UserCard.g.tsx#default",
          "name": "UserCard",
          "mode": "scope",              // pure | scope | unknown
          "frames": [
            {
              "name": "ready",
              "slots": ["props", "scope"],
              "axes": { "auth": "login" }   // variant coverage marks, axis → variant(s)
            }
          ],
          "contexts": {                  // consumed contexts and their declared axes
            "auth": { "variants": ["login", "anonymous"] }
          },
          "dependencies": ["src/Badge.g.tsx#default"],
          "diagnostics": []
        }
      ],
      "diagnostics": []
    }
  ],
  "diagnostics": []
}
```

Key decisions proposed here (each is an open question below):

- **The manifest is an index, not a data dump.** Frame *names*, slot usage, axis coverage, dependencies, and diagnostics are in the manifest; frame *values* stay language-native in source and are realized by the binding at render time. An optional `values` capability may later expose the JSON-serializable subset for tools that need it.
- **Workspace concerns move to extensions.** Preview URL templates, serve-session identity, design-board entries, and cache hints become a namespaced extension block (e.g. `"x-runelight": { … }`), not core manifest fields. Studio consumes core + its extension; a Dart tool can ignore the extension entirely.
- **Bindings are identified and versioned** per unit (`tsx@1`, `vue-sfc@1`, `dart@0`), so mixed-language monorepos produce one manifest.

### Layer 3: G-Bindings (per-language source conventions)

A binding specification must answer, for its language:

1. **Participation** — file naming (`.g.dart`, `.g.swift`, …) and how entries are identified.
2. **Frame declaration** — the statically enumerable construct carrying frames, and how it is kept out of production builds.
3. **Seam mechanism** — how `scope` substitution works without executing production state acquisition.
4. **Context mechanism** — how `context` entries and Variant Axes are declared and substituted.
5. **Static-value discipline** — which value forms count as statically analyzable in that language.
6. **Branch analyzability** (for L3) — which view-construction shapes the checker can trace.

Existing bindings become reference specs: **`tsx@1`** (static `Component.frames` property; hook/provider seams; JSX branch analysis) and **`vue-sfc@1`** (`<g:frames>` custom block; template-first scope; directive analysis).

Illustrative sketches for future bindings (NOT designs, just plausibility arguments):

```dart
// user_card.g.dart — Flutter (illustrative)
class UserCard extends StatelessWidget {
  const UserCard({super.key, required this.userId});
  final String userId;
  @override
  Widget build(BuildContext context) { /* … */ }
}

// Statically enumerable: const top-level declaration with literal values.
const userCardGFrames = GFrames({
  'loading': GFrame(props: {'userId': 'user_1'}, scope: {'status': 'loading'}),
  'ready': GFrame(props: {'userId': 'user_42'}, scope: {'status': 'ready', 'name': 'Ada'}),
});
```

```swift
// UserCard.g.swift — SwiftUI (illustrative)
struct UserCard: View {
  let userId: String
  var body: some View { /* … */ }
}

extension UserCard: GFramed {
  static let gFrames: GFrames = [
    "loading": GFrame(props: ["userId": "user_1"], scope: ["status": "loading"]),
    "ready": GFrame(props: ["userId": "user_42"], scope: ["status": "ready", "name": "Ada"]),
  ]
}
```

Candidate seam mappings to seed binding discussions:

| Platform | `scope` seam candidate | `context` candidate |
| --- | --- | --- |
| React | `createGScopeHook` (exists) | `createGProvider` (exists) |
| Vue SFC | template-scope injection (exists) | native `provide`/`inject` + `defineGInjectionKey` (exists) |
| Flutter | a `GScope` boundary substituting state objects passed to `build` | `InheritedWidget` substitution |
| SwiftUI | observable-object / view-model seam | `Environment` value substitution |
| Compose | state-hoisting boundary at the composable parameter list | `CompositionLocal` substitution |

### Layer 4: G-Conformance (capability levels)

Bindings and tools declare what they support; nothing requires everything at once:

| Level | Name | A conforming implementation can… |
| --- | --- | --- |
| **L0** | Enumerate | parse Source Units and emit the manifest: coordinates, frame names, slots, diagnostics |
| **L1** | Render | render a named frame inside the host runtime (preview) |
| **L2** | Substitute | render any declared state through seams without executing production state acquisition |
| **L3** | Verify | statically check that reachable visual branches are covered by frames |
| **L4** | Axes | declare Variant Axes and verify frame coverage against them |

The React and Vue bindings are L0–L4 today. A new binding shipping at L0/L1 is already useful (enumeration + preview), with L2–L4 as a roadmap. The `capabilities` manifest field carries this per project; conformance is testable by a shared suite (the repository's intelligence-test pattern is a good seed for it).

### Diagnostics registry

Codes become namespaced: a core registry (`core/missing-frames`, `core/non-static-frame-key`) and binding registries (`tsx/uncovered-jsx-branch`, `vue-sfc/opaque-vue-template-control-flow`), with `x-*` reserved for vendor extensions. Existing flat codes map 1:1; the manifest may carry both forms during migration.

## Open Questions (the actual discussion agenda)

1. **Index vs values.** Should the core manifest ever carry frame values, or only names/coverage metadata with values realized at render time? Proposal: index-only core + optional `values` capability for the JSON-serializable subset. What do design tools and visual-diff services actually need?
2. **Coordinate stability.** Path+export breaks on file moves. Do we need optional stable IDs (explicit `gid`), or is path-based identity with rename detection enough?
3. **Frame value space.** What is the portable static value space? JSON + callback stubs covers React/Vue today. Dart/Swift need typed constructors — does "statically enumerable" need a per-binding definition with a shared minimum (literal keys, literal-ish values, no runtime generation)?
4. **Where frames live per language.** Same file (current bindings) vs sibling file (`user_card.g_frames.dart`) vs annotations/macros. Same-file is the current invariant — is it worth keeping as a hard rule, or should the binding spec only require "co-located and statically discoverable"?
5. **Branch analyzability across paradigms.** JSX and Vue templates have analyzable view syntax. Flutter `build` methods and SwiftUI result builders are general code. Is L3 realistic there, or do those bindings cap at L2 with an opt-in "inspectable subset" style guide (mirroring the existing first-order-expression discipline)?
6. **The `scope` concept outside hooks.** React scope = wrapped hook output; Vue scope = template-visible values. Is "seam-substituted internal state" the right unifying definition, or does it fragment per platform?
7. **Manifest versioning.** Integer version (current `version: 1`) vs semver string? How do tools negotiate — reject, or degrade by `capabilities`?
8. **Extension mechanism.** Is a single `x-<vendor>` block enough, or do we need per-unit extensions too (e.g. Studio's `groupId`, design-board metadata)?
9. **Who owns the schema.** Does the JSON Schema live in this repository (`@runelight/protocol` package / `schemas/` directory), and is `g-manifest` published independently of Runelight releases?
10. **Naming.** Is `.g` the protocol's permanent public name? (`g-manifest`, `gManifestVersion`, `GFrames` all build on it; renaming later gets expensive fast.)

## Proposed Next Steps

1. Land this RFC as a living document; collect positions on the open questions above.
2. Extract a JSON Schema for the **current** manifest (as `g-manifest/1`) so external tools get a contract for what already ships, before any v2 redesign.
3. Refactor the manifest builder to separate core protocol payload from the `x-runelight` workspace extension (non-breaking: emit both shapes during transition).
4. Write the `tsx@1` and `vue-sfc@1` binding specs by documenting current behavior — they are the reference implementations.
5. Prototype one non-web binding at L0 only (Flutter is the best candidate: `package:analyzer` makes const-literal enumeration tractable) to pressure-test the G-Model abstractions before freezing v2.
6. Define the conformance test suite skeleton, reusing the intelligence-test card format for cross-implementation behavior checks.
