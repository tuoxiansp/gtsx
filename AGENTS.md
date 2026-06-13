# AGENTS.md

This file defines the project-level decision policy for AI agents.

The goal is not to enforce generic best practices.
The goal is to help agents make better micro-decisions under this project's actual stage, audience, and constraints.

---

## Project Context

- Current stage: Internal pre-release Runelight monorepo. Public-facing artifacts already exist and should stay coherent and intentional, but there is no formal public compatibility promise yet.
- Primary audience: AI agents and developers using agents to install, author, refactor, design, and verify Runelight-enabled UI.
- Secondary audience: Human developers evaluating the product direction, maintaining the CLI/adapters/Studio, or running examples and intelligence tests.
- Core artifact responsibility: Keep the tooling contract, `.g` protocol, static frame contract, Studio sidecar workflow, framework implementation ends, setup/authoring/refactor/design skills, examples, docs, tests, and product vocabulary coherent with each other.
- Main current risk: Cross-surface contract drift: an agent makes a locally reasonable change in one surface, but leaves the protocol, checker, Studio manifest, adapters, skills, examples, tests, or product language inconsistent.
- This project is not trying to be: A generic component preview clone, a lowest-common-denominator framework abstraction, a replacement framework/runtime, a mature contributor-policy template, or a production-exposed Studio surface by default.
- Confidence / evidence: High for protocol, tooling, adapter, setup, and agent-behavior rules based on `README.md`, `docs/`, `skills/`, `intelligence-tests/`, package metadata, selected implementation files, tests, examples, and website frames. Medium for release/governance strategy because the project is still internal pre-release.

---

## Global Decision Rules

### Rule 1: Tooling Contract Before Framework Shape

- Prioritize: The needs of `runelight check`, Studio, manifests, preview targets, frame enumeration, and static analysis.
- Even though: React, Vue, Vite, and Next implementation ends each have their own convenient source shapes and adapter mechanics.
- Because: The protocol abstraction is about satisfying the tool's usage surface, not about deriving a shared component model from current framework implementations.
- Reject: Changes that let one framework adapter's convenience rename, dilute, or distort protocol concepts such as frames, scope, providers, manifests, Host, Adapter, sidecar, or seam.
- Applies to: Protocol docs, analyzer/check behavior, manifest shape, preview transforms, adapters, skills, examples, and tests.
- Micro-decisions affected: Where a concept belongs, whether to lift a repeated pattern into protocol language, how to name fields and diagnostics, and whether a framework-specific workaround should remain local.
- Exception: When multiple implementation ends expose the same tooling need, promote that need into the protocol deliberately and update connected surfaces together.

### Rule 2: Protect Static Inspectability

- Prioritize: Source shapes that `runelight check`, Studio manifests, and preview transforms can statically inspect.
- Even though: Helper predicates, generated frame objects, loops, `switch` statements, or stored JSX/template fragments may look cleaner in ordinary React/Vue code.
- Because: The product promise depends on enumerating frames and tracing visual branches without executing opaque application state.
- Reject: Refactors that hide branch reachability behind generic helpers, computed frame keys, dynamic spreads, runtime frame generation, or framework magic.
- Applies to: `.g.tsx`, `.g.vue`, analyzers, transforms, examples, skills, docs, and tests.
- Micro-decisions affected: Branch expression style, frame object shape, provider/injection markers, examples, diagnostic wording, and whether a helper is worth adding.
- Exception: Non-structural formatting helpers are acceptable when they do not determine whether visible UI renders.

### Rule 3: Keep Preview Sidecar Boundaries Small

- Prioritize: Studio and preview as a sidecar hosted by the user's existing framework, with one explicit preview seam.
- Even though: A separate preview runtime, custom app shell, or richer local integration may seem easier to control.
- Because: Runelight promises not to replace the Host, router, data layer, framework runtime, or production render path.
- Reject: App-local reimplementations of preview protocol handling, boundary collectors, frame override merging, router shells, or providers that duplicate adapter/runtime responsibilities.
- Applies to: CLI serve/capture, Vite adapters, Next adapter, preview runtimes, Studio iframe behavior, and setup profiles.
- Micro-decisions affected: Whether code belongs in an adapter versus user glue, whether preview route wrappers can call hooks, and how much visual environment setup belongs in static imports/classes.
- Exception: A framework-specific adapter may own minimal glue when the host requires it, but the glue should stay thin and conventional.

### Rule 4: Break Coherently In Pre-Release

- Prioritize: Coherent contract movement across connected surfaces over preserving stale compatibility.
- Even though: Compatibility layers can feel safer and more mature.
- Because: Runelight is internal pre-release, so breaking changes are acceptable when they make the tooling contract clearer and the affected docs, skills, examples, and tests move with it.
- Reject: Partial breaking changes that update only one package, one doc, or one skill while leaving adjacent surfaces to imply the old contract.
- Applies to: Protocol fields, analyzer diagnostics, config, CLI, adapter routes, package exports, skills, examples, docs, tests, and intelligence tests.
- Micro-decisions affected: Whether to add a compatibility shim, whether to migrate examples, whether to update skills, and how much verification is needed after a contract change.
- Exception: Preserve compatibility only when compatibility itself is the explicit product goal for that task.

### Rule 5: Production Is Unexposed By Default

- Prioritize: Development-only Runelight routes and generated files unless an explicit internal exposure path is being tested.
- Even though: Production Studio exposure can be useful for controlled fixtures and demos.
- Because: Production exposure changes the product boundary from local development sidecar to deployable review surface, which has security, routing, cache, permission, and messaging consequences.
- Reject: Documentation or setup changes that turn `studio.exposeInProduction` or production preview assets into normal user guidance.
- Applies to: Vite/Next adapters, setup skills, config docs, CLI docs, intelligence tests, and package examples.
- Micro-decisions affected: Environment guards, dynamic imports, generated registry writes, build-time config loading, docs phrasing, and test fixture scope.
- Exception: Controlled tests may exercise production exposure, but must label it internal/fixture-only and verify the default remains unexposed.

### Rule 6: Treat Skills As Product Surface

- Prioritize: Agent skills as executable product workflows that must stay synchronized with docs, examples, and tests.
- Even though: Skills may look like auxiliary documentation rather than shipped product surface.
- Because: The README installer flow routes through skills, and intelligence tests validate project-local skill installation and framework-specific companion skills.
- Reject: Generic skill bundles, global-only installation assumptions, framework-irrelevant companion skills, or edits that let React/Vue skill copies drift where tests require parity.
- Applies to: `skills/setup-runelight`, authoring/refactor/design skills, README installer prompt, intelligence tests, and docs links.
- Micro-decisions affected: Whether to update a skill with a workflow change, which companion skill to install, how to describe design references, and whether a test should assert skill behavior.
- Exception: A workflow change may leave a matching skill untouched only after inspection confirms the skill remains valid.

### Rule 7: Preserve User Host Behavior

- Prioritize: Existing app routes, framework config composition, visual CSS environment, package-manager choice, and production behavior.
- Even though: Replacing local glue with profile examples may produce a neater integration.
- Because: Setup/upgrade is supposed to be idempotent and minimal, not a migration of the user's app into a Runelight-shaped template.
- Reject: Overwriting working wrappers, hard-coding `pnpm`, pointing `host.command` at scripts that recursively run `runelight serve`, or moving production app structure unless verification proves it is necessary.
- Applies to: Setup profiles, adapter examples, intelligence tests, and any user-project fixture work.
- Micro-decisions affected: Host command generation, route-group remediation, config wrapper edits, package manager commands, CSS imports, and provider placement.
- Exception: If verification shows an existing integration violates the current adapter contract, migrate only the affected glue and explain the concrete reason.

### Rule 8: Real Visual UI, Not Wrappers

- Prioritize: `.g.tsx` and `.g.vue` files that own real visible UI and meaningful visual states.
- Even though: Thin wrappers around existing components can make progress look faster.
- Because: Wrapper frames hide the actual visual branch surface and weaken Studio as a map of real UI states.
- Reject: Bulk converting route glue, provider nesting, layout slots, forwarding components, or scope values that contain React/Vue nodes just to get files into Studio.
- Applies to: Authoring guides, refactor skills, examples, analyzer diagnostics, and component reviews.
- Micro-decisions affected: Whether to descend, skip, migrate, or split a component; whether to add frames; and how to name coverage states.
- Exception: Public slot/node props may appear in frames only when that is the real component contract, not a workaround.

### Rule 9: Design Drafts Are Separate From Coverage

- Prioritize: Design frames as self-contained one-frame explorations under `project.entryRoot/design`.
- Even though: It can be tempting to turn design explorations into formal component coverage or to store screenshots/layout state.
- Because: The design workspace is a scratchpad for product direction, while component `.g.*` files are the static coverage contract for production UI.
- Reject: Design drafts under `.runelight`, placeholder frames during setup, multiple frame keys for alternatives, serialized DOM, screenshots, or browser layout positions in the repo.
- Applies to: `docs/runelight-design-workspace.md`, design skills, setup profiles, examples, and Studio design code.
- Micro-decisions affected: File placement, frame naming, whether to create variants or multiple files, whether hooks are allowed, and what verification URL to use.
- Exception: A design draft may import stable local styles/components when the preview environment can resolve them and the file remains easy to inspect.

### Rule 10: Narrow Tests Around Public Contracts

- Prioritize: Tests that encode protocol, setup, adapter, lifecycle, production-boundary, and cross-surface workflow behavior.
- Even though: Broad snapshotting or large fixture rewrites can feel more comprehensive.
- Because: The project changes across docs, skills, adapters, and examples; tests should catch contract drift without freezing incidental implementation detail.
- Reject: Tests that treat an already-initialized project as setup proof, ignore process groups, rely on global skills, or validate only mocks when the user workflow depends on a real Host.
- Applies to: Unit tests, intelligence tests, examples, CLI lifecycle checks, and adapter fixtures.
- Micro-decisions affected: Fixture shape, assertions, cleanup obligations, command scope, and whether to add an intelligence test versus a unit test.
- Exception: Low-level pure helpers can use focused unit tests without full Host lifecycle coverage.

### Rule 11: Prefer Current Product Truth Over Generic Ceremony

- Prioritize: Docs and project rules that describe the real current contract, limits, workflow, internal pre-release status, and product language.
- Even though: Mature open-source projects often add contributor guides, exhaustive roadmaps, governance files, compatibility policies, and polished public promises.
- Because: Premature ceremony can mislead agents into protecting stale compatibility or presenting unstable internals as settled commitments.
- Reject: Adding governance/checklist docs, support matrices, compatibility promises, issue templates, or formal policies unless the task explicitly requires them or existing facts justify them.
- Applies to: README, docs, skills, examples, package metadata, website copy, and this `AGENTS.md`.
- Micro-decisions affected: Documentation scope, heading structure, wording strength, whether to add missing files, and how to describe limitations or breaking changes.
- Exception: Existing public-facing artifacts should still be high-quality, intentional, and coherent even while the project remains internal pre-release.

### Rule 12: Keep Runelight UI Purpose-Built

- Prioritize: Studio as a dense, scannable, state-oriented technical workspace, and Runelight-facing visuals that show real product behavior with a strong point of view.
- Even though: Generic SaaS dashboards, decorative gradients, oversized cards, or animated marketing patterns may look modern.
- Because: The product is a visual workspace for inspecting UI state, so the interface should make frames, variants, boundaries, and preview failures legible while the external expression remains specific to Runelight.
- Reject: Random new color systems, mismatched radii, decorative cards, visual chrome that hides iframes, fake product proof, or website imagery that does not reveal the actual product.
- Applies to: `packages/studio`, `apps/website`, Studio `.g.tsx` components, design references, and capture assets.
- Micro-decisions affected: Color/token reuse, component density, iframe sizing, error states, visual proof assets, website tone, and whether a design change needs screenshot/Studio verification.
- Exception: Design workspace explorations may try sharper directions, but each direction should still be product-specific, inspectable, and non-template.

### Rule 13: Ask Before Product Boundary Expansion

- Prioritize: Autonomous work inside an accepted direction; human confirmation before changing what Runelight claims to be.
- Even though: Agents can often infer a plausible next abstraction or feature.
- Because: New CLI commands, config keys, route semantics, framework implementation ends, production exposure guidance, setup strategies, or protocol concepts change product direction, not just implementation.
- Reject: Unrequested product-boundary expansion, even if the change is technically clean and internally breaking compatibility is allowed.
- Applies to: CLI, config, package exports, route behavior, setup profiles, protocol concepts, docs, website claims, and tests.
- Micro-decisions affected: Whether to implement directly, present a plan first, or ask a question before touching contract-shaped files.
- Exception: Bug fixes that restore an already accepted direction may proceed, but update nearby tests/docs/skills when the connected contract changes.

---

## Domain-Specific Rules

### Documentation

- Bias documentation toward contract, workflow, and product-language alignment for agents and early technical users.
- Keep README, docs, skills, examples, and intelligence tests aligned when the user-facing or agent-facing workflow changes.
- State the internal pre-release reality plainly: breaking changes are allowed, but connected docs/skills/tests/examples must move with them.
- Prefer precise limitations over smooth marketing: current implementation ends are TypeScript React and Vue 3, with Vite React, Vite Vue, and Next App Router as concrete integration paths.
- Avoid premature README splitting, contributor checklists, governance docs, broad support matrices, or compatibility promises unless requested or backed by existing project facts.
- Document what agents must do now: install/refresh the right project-local skills, preserve host behavior, run `runelight check`, verify Studio/manifest/preview URLs, and respect production defaults.
- Delay speculative docs for new implementation ends, public production Studio exposure, or generalized host runtimes until the implementation and tests make those contracts real.

### Code

- Prefer coherent contract-level changes over broad incidental refactors. Small local edits are good when the contract is stable; larger breaking edits are acceptable when they intentionally move the tooling contract and update connected surfaces.
- Keep protocol/tooling concepts distinct from framework implementation details. React `.g.tsx`, Vue `.g.vue`, Vite React, Vite Vue, and Next App Router are implementation ends for the tool contract.
- Add helpers only when they preserve or clarify a current contract; do not introduce helpers that make frames, branches, provider variants, generated registries, or route enablement harder to inspect.
- Do not add compatibility layers just to preserve stale internal contracts unless compatibility is the explicit product goal.
- Treat generated and adapter-owned files as generated. Do not store user design drafts or runtime state under `.runelight`.
- Error handling should produce actionable diagnostics with existing stage/code style; avoid swallowing uncertainty behind success-looking output.
- For tests, choose the smallest level that proves the contract: unit tests for pure parsing/analysis, adapter tests for route/build semantics, and intelligence tests for real setup/lifecycle UX.

### UI / Design

- UI is applicable: the repo contains Studio, the website, Runelight design frames, screenshots, and design skills.
- Studio UI should remain a technical workspace: dense, legible, canvas/iframe/state oriented, and optimized for scanning frames, variants, errors, boundaries, and render status.
- Runelight's external expression may be sharp and opinionated. It does not need to look like neutral enterprise SaaS, but it must be specific, coherent, and grounded in real product behavior.
- Website UI should use real product captures and concrete Runelight copy rather than generic credibility patterns.
- Reuse existing visual language before introducing colors, shadows, spacing, radii, or motion. The website currently uses a dark product-forward palette with cyan accent and real Studio screenshots; Studio code has precise layout constants for frame grids/chrome.
- Avoid generic AI/SaaS visual tropes: purple gradients, decorative blobs, card-heavy dashboards, fake metrics, fake logos, and visual effects that reduce inspectability.
- Verify substantial UI work through Studio, preview/capture, or browser screenshots when practical, especially when iframe framing, canvas geometry, or responsive text can break the product experience.

### Product / UX

- Current product decisions should optimize for trustworthy install/setup, inspectable visual states, accurate Studio rendering, and coherent product vocabulary over a mature public onboarding funnel.
- Expose limitations plainly: no production Studio by default, no proof that every possible state combination is covered, no replacement for the user's app runtime, and no compatibility promise while internal pre-release.
- Preserve future choices by keeping the `.g` protocol additive around tooling needs, but do not add public API hooks just because a future implementation end might need them.
- Favor real user workflows over internal neatness: fresh setup projects, project-local skills, direct Host commands, existing app routes still rendering, and dev-server lifecycle cleanup.
- Treat design exploration as a way to help users react to product direction quickly, not as evidence that production state coverage is complete.

### Agent Behavior

- Before non-mechanical tasks, read the files that own the contract being touched: `README.md`, relevant docs in `docs/`, matching skills in `skills/`, relevant package source, tests, examples, and intelligence tests.
- Always check for existing local changes before editing. This repo may contain user work; do not revert or format unrelated files.
- Agents may act autonomously for local implementation, bug fixes, docs/skills/tests synchronization, and even breaking implementation changes when the product direction is already accepted and connected surfaces are kept coherent.
- Agents should present a plan before cross-surface contract migrations, analyzer/transform rewrites, setup profile migrations, Studio render scheduling changes, or significant website/design direction changes.
- Agents must ask a human before changing product boundaries: production Studio as a formal feature, new framework implementation ends, new user-facing promises, new setup installation strategy, new protocol concepts, public CLI/config/export expansion, or route semantic changes.
- Do not expand the task into making the repo look mature. Missing conventional files are not automatically missing project needs.
- When modifying user-facing or agent-facing workflows, update the minimum connected set: implementation, docs, skills, examples, tests, and intelligence tests only when each is affected by the contract change.
- When verification is possible, prefer concrete project commands such as targeted `vitest`, `pnpm --filter ... typecheck`, `runelight check`, `runelight serve`, or browser/Studio checks over claiming confidence from static reading alone.

#### Per-Task Decision Context Preflight Prompt

Use this prompt at the start of every non-mechanical task. Apply it internally by default. Share a short preflight summary with the user when the task is cross-surface, intentionally breaking, or product-boundary-changing.

```text
Before acting, identify the task-level decision context for this Runelight repo.

1. What contract surface does this task touch?
   Options include tooling contract, .g protocol, analyzer/static checks, React implementation end, Vue implementation end, setup skills, adapter glue, CLI lifecycle, Studio UI, website, examples, docs, or intelligence tests.

2. Which current project facts must constrain the work?
   Read the smallest relevant set from README.md, docs/, skills/, package source, examples, and tests before deciding.

3. What should be protected most?
   Usually one of: tooling contract coherence, static inspectability, production isolation, host preservation, project-local skill behavior, design-vs-coverage separation, product vocabulary, or truthful current documentation.

4. Is this change breaking?
   If yes, name the connected surfaces that must move together or be inspected and explicitly left unchanged.

5. What tempting generic improvement should be avoided here?
   Name the specific maturity move, compatibility layer, abstraction, docs expansion, UI flourish, or refactor that would be plausible but risky for this repo.

6. Can I decide autonomously, should I present a plan, or must I ask?
   Decide autonomously for direction-aligned work. Present a plan for broad contract migrations. Ask before product boundary expansion.

7. What is the smallest verification that proves the intended contract?
   Pick targeted unit tests, typecheck, runelight check, Studio/manifest/preview checks, intelligence-test validation, or document-only review as appropriate.
```

---

## Anti-Checklist

- Do not default to adding mature contributor/project-management files unless the user asks for them or existing docs/tests show they are needed.
- Do not avoid breaking changes by adding compatibility layers unless compatibility is an explicit goal.
- Do not make a breaking change in only one surface unless the other surfaces are inspected and confirmed unaffected.
- Do not create new public CLI commands, config fields, route options, package exports, framework implementation ends, or protocol concepts unless the product direction has been confirmed.
- Do not split README or docs into a larger information architecture unless the current reader path is failing in a concrete way.
- Do not refactor analyzer, transform, adapter, or Studio scheduling code broadly unless a reproduced bug or contract change demands it.
- Do not formalize production Studio exposure unless the task is explicitly about that product direction and preserves the default unexposed behavior until changed deliberately.
- Do not create wrapper `.g.tsx` or `.g.vue` files unless the wrapper is the real visual component contract rather than a shortcut around migration.
- Do not install or document irrelevant framework companion skills unless the detected project type genuinely requires them.
- Do not use global skills as proof of setup unless the workflow explicitly targets global installation; this repo's setup flow validates project-local skills.
- Do not store design drafts, screenshots, serialized DOM, runtime values, or preview registries as hand-authored repo artifacts unless the relevant docs already define them as source artifacts.
- Do not replace host app routes, package-manager commands, framework config wrappers, or visual CSS setup unless verification shows the existing integration is broken.
- Do not make Studio or website UI generic unless the change improves real product comprehension, frame inspection, or visual proof.
- Do not claim broader production, security, performance, compatibility, or API guarantees unless the implementation, docs, and tests already support them.
