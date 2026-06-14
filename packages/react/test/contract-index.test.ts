import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildRunelightProjectIndex, createCachedRunelightProjectIndexBuilder } from "../../core/src/project-index.js"
import { runelightReactContract } from "../src/contract.js"

const fixtureRoot = join(import.meta.dirname, "../../core/test/fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "../../core/test/fixtures/ts-project-scope")
const examplesRoot = join(import.meta.dirname, "../../../examples/react-vite")

describe("Runelight project index", () => {
  it("describes the selected Runelight project without Studio route or preview concerns", () => {
    const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })

    expect(index).toEqual({
      version: 1,
      files: [
        {
          path: "src/corpus/Badge.g.tsx",
          sourceHash: expect.any(String),
          components: [
            {
              coordinate: "src/corpus/Badge.g.tsx#default",
              filePath: "src/corpus/Badge.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "Badge",
              mode: "pure",
              frameVisualSignatures: {
                neutral: expect.any(String),
                success: expect.any(String),
              },
              frameDependencies: {
                neutral: [],
                success: [],
              },
              frames: [
                { kind: "pure", name: "neutral" },
                { kind: "pure", name: "success" },
              ],
              providers: {},
              visualSignature: expect.any(String),
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
        {
          path: "src/corpus/StatusPanel.g.tsx",
          sourceHash: expect.any(String),
          components: [
            {
              coordinate: "src/corpus/StatusPanel.g.tsx#default",
              filePath: "src/corpus/StatusPanel.g.tsx",
              sourceHash: expect.any(String),
              exportName: "default",
              componentName: "StatusPanel",
              mode: "pure",
              frameVisualSignatures: {
                error: expect.any(String),
                loading: expect.any(String),
              },
              frameDependencies: {
                error: [],
                loading: [],
              },
              frames: [
                { kind: "pure", name: "loading" },
                { kind: "pure", name: "error" },
              ],
              providers: {},
              visualSignature: expect.any(String),
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    })
    expect(JSON.stringify(index)).not.toContain("/runelight/studio")
    expect(JSON.stringify(index)).not.toContain("urlTemplate")
  })

  it("follows the selected TypeScript project scope", () => {
    const index = buildRunelightProjectIndex({
      contracts: [runelightReactContract],
      cwd: tsProjectScopeRoot,
      sourceRoot: "src",
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })

    expect(index.files.map((file) => file.path)).toEqual([
      "src/app/runelight/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("can include route design roots outside the selected source root", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-route-design-index-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      mkdirSync(join(cwd, "app/runelight/design"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(cwd, "app/runelight/design/Sketch.g.tsx"),
        ["export default function Sketch() { return null }", "Sketch.frames = { live: { props: {} } }", ""].join("\n"),
      )

      const index = buildRunelightProjectIndex({
        contracts: [runelightReactContract],
        additionalSourceRoots: ["app/runelight/design"],
        cwd,
        sourceRoot: "src",
      })

      expect(index.files.map((file) => file.path)).toEqual(["app/runelight/design/Sketch.g.tsx", "src/Card.g.tsx"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("records static Runelight component dependencies from TypeScript path aliases", () => {
    const index = buildRunelightProjectIndex({
      contracts: [runelightReactContract],
      cwd: tsProjectScopeRoot,
      sourceRoot: "src",
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })
    const included = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/Included.g.tsx#default")

    expect(included?.dependencies).toEqual(["src/Child.g.tsx#default"])
  })

  it("records static Runelight component dependencies from JSX imports", () => {
    const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: examplesRoot, sourceRoot: "src/frames" })
    const dashboard = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/frames/stateful/DashboardShell.g.tsx#default")

    expect(dashboard?.dependencies).toEqual(["src/frames/stateful/NotificationBell.g.tsx#default"])
  })

  it("records static Runelight component dependencies through local JSX aliases", () => {
    const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src" })
    const aliasImportedDependency = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/AliasImportedDependency.g.tsx#default")

    expect(aliasImportedDependency?.dependencies).toEqual(["src/HookDependencyChild.g.tsx#HookDependencyChild"])
  })

  it("records static React visual signatures from JSX and referenced bindings", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-visual-signature-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'const label = "Before"',
          "const ignored = 1",
          "export default function Card() { return <span>{label}</span> }",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      const first = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const firstSignature = first.files[0]?.components[0]?.visualSignature

      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'const label = "Before"',
          "const ignored = 2",
          "export default function Card() { return <span>{label}</span> }",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      const nonVisual = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      expect(nonVisual.files[0]?.components[0]?.visualSignature).toBe(firstSignature)

      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'const label = "After"',
          "const ignored = 2",
          "export default function Card() { return <span>{label}</span> }",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      const visual = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      expect(visual.files[0]?.components[0]?.visualSignature).not.toBe(firstSignature)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("keeps React visual signatures stable when only frame mock data changes", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-frame-mock-signature-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "export default function Card(props: { label: string }) {",
          "  return <span>{props.label}</span>",
          "}",
          'Card.frames = { ready: { props: { label: "Before" } } }',
          "",
        ].join("\n"),
      )
      const first = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const firstComponent = first.files[0]?.components[0]

      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "export default function Card(props: { label: string }) {",
          "  return <span>{props.label}</span>",
          "}",
          'Card.frames = { ready: { props: { label: "After" } } }',
          "",
        ].join("\n"),
      )
      const second = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const secondComponent = second.files[0]?.components[0]

      expect(secondComponent?.visualSignature).toBe(firstComponent?.visualSignature)
      expect(secondComponent?.frameVisualSignatures?.ready).toBe(firstComponent?.frameVisualSignatures?.ready)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("does not overflow when a local alias points back to itself", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-alias-cycle-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          "export default function Card() {",
          "  const ready = ready",
          "  return ready ? <span>Ready</span> : <span>Idle</span>",
          "}",
          "Card.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )

      const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })

      expect(index.files[0]?.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("contract-index-failed")
      expect(index.files[0]?.components[0]?.frameVisualSignatures?.ready).toEqual(expect.any(String))
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("projects React visual signatures through static frame branches", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-frame-projection-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'type CardProps = { theme: "default" | "special" }',
          "export default function Card(props: CardProps) {",
          '  return <section className="card"><span>Base</span></section>',
          "}",
          'Card.frames = { plain: { props: { theme: "default" } }, special: { props: { theme: "special" } } }',
          "",
        ].join("\n"),
      )
      const before = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const beforeComponent = before.files[0]?.components[0]

      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'type CardProps = { theme: "default" | "special" }',
          "export default function Card(props: CardProps) {",
          "  return (",
          '    <section className={`card ${props.theme === "special" ? "card--special" : ""}`}>',
          '      {props.theme === "special" ? <strong>Special</strong> : <span>Base</span>}',
          "    </section>",
          "  )",
          "}",
          'Card.frames = { plain: { props: { theme: "default" } }, special: { props: { theme: "special" } } }',
          "",
        ].join("\n"),
      )
      const after = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const afterComponent = after.files[0]?.components[0]

      expect(afterComponent?.frameVisualSignatures?.plain).toBe(beforeComponent?.frameVisualSignatures?.plain)
      expect(afterComponent?.frameVisualSignatures?.special).not.toBe(beforeComponent?.frameVisualSignatures?.special)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("uses top-level static object spreads when projecting frame branches", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-frame-spread-projection-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'import { createGScopeHook } from "@runelight/react/runtime"',
          'const baseScope = { theme: "default" }',
          "const useCardScope = createGScopeHook(() => baseScope)",
          "export default function Card() {",
          "  const { theme } = useCardScope()",
          '  return <section>{theme === "special" ? <strong>Special</strong> : <span>Base</span>}</section>',
          "}",
          'Card.frames = { plain: { scope: { ...baseScope } }, special: { scope: { ...baseScope, theme: "special" } } }',
          "",
        ].join("\n"),
      )

      const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const card = index.files[0]?.components[0]

      expect(card?.frameVisualSignatures?.plain).not.toBe(card?.frameVisualSignatures?.special)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("projects local JSX component branches through static props", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-local-prop-projection-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'import { createGScopeHook } from "@runelight/react/runtime"',
          'type Theme = "default" | "special"',
          'const baseScope = { theme: "default" as Theme }',
          "const useCardScope = createGScopeHook(() => baseScope)",
          "function Label({ theme }: { theme: Theme }) {",
          "  return <span>Base</span>",
          "}",
          "export default function Card() {",
          "  const { theme } = useCardScope()",
          "  return <section><Label theme={theme} /></section>",
          "}",
          'Card.frames = { plain: { scope: { ...baseScope } }, special: { scope: { ...baseScope, theme: "special" } } }',
          "",
        ].join("\n"),
      )
      const before = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const beforeComponent = before.files[0]?.components[0]

      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'import { createGScopeHook } from "@runelight/react/runtime"',
          'type Theme = "default" | "special"',
          'const baseScope = { theme: "default" as Theme }',
          "const useCardScope = createGScopeHook(() => baseScope)",
          "function Label({ theme }: { theme: Theme }) {",
          '  return theme === "special" ? <strong>Special</strong> : <span>Base</span>',
          "}",
          "export default function Card() {",
          "  const { theme } = useCardScope()",
          "  return <section><Label theme={theme} /></section>",
          "}",
          'Card.frames = { plain: { scope: { ...baseScope } }, special: { scope: { ...baseScope, theme: "special" } } }',
          "",
        ].join("\n"),
      )
      const after = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const afterComponent = after.files[0]?.components[0]

      expect(afterComponent?.frameVisualSignatures?.plain).toBe(beforeComponent?.frameVisualSignatures?.plain)
      expect(afterComponent?.frameVisualSignatures?.special).not.toBe(beforeComponent?.frameVisualSignatures?.special)
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("records React frame dependencies only for frames that reach the dependency", () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-react-frame-dependencies-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Child.g.tsx"),
        [
          "export default function Child() {",
          "  return <span>Child</span>",
          "}",
          "Child.frames = { ready: { props: {} } }",
          "",
        ].join("\n"),
      )
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        [
          'import Child from "./Child.g"',
          'type CardProps = { mode: "plain" | "withChild" }',
          "export default function Card(props: CardProps) {",
          '  return <section>{props.mode === "withChild" ? <Child /> : <span>Plain</span>}</section>',
          "}",
          'Card.frames = { plain: { props: { mode: "plain" } }, withChild: { props: { mode: "withChild" } } }',
          "",
        ].join("\n"),
      )

      const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd, sourceRoot: "src" })
      const card = index.files
        .flatMap((file) => file.components)
        .find((component) => component.coordinate === "src/Card.g.tsx#default")

      expect(card?.dependencies).toEqual(["src/Child.g.tsx#default"])
      expect(card?.frameDependencies).toEqual({
        plain: [],
        withChild: ["src/Child.g.tsx#default"],
      })
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("indexes local functions exported from a list when they declare frames", () => {
    const index = buildRunelightProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src" })
    const exportList = index.files.find((file) => file.path === "src/ExportList.g.tsx")

    expect(exportList?.components.map((component) => component.coordinate)).toEqual([
      "src/ExportList.g.tsx#ExportListBadge",
    ])
    expect(exportList?.diagnostics).toEqual([])
  })

  it("can reuse a project index briefly for high-frequency Studio route reads", () => {
    const buildProjectIndex = createCachedRunelightProjectIndexBuilder({ ttlMs: 60_000 })
    const first = buildProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const second = buildProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const differentScope = buildProjectIndex({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src" })

    expect(second).toBe(first)
    expect(differentScope).not.toBe(first)
  })

  it("shares the cached project index across provider instances", () => {
    const firstProvider = createCachedRunelightProjectIndexBuilder({ ttlMs: 60_000 })
    const secondProvider = createCachedRunelightProjectIndexBuilder({ ttlMs: 60_000 })
    const first = firstProvider({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const second = secondProvider({ contracts: [runelightReactContract], cwd: fixtureRoot, sourceRoot: "src/corpus" })

    expect(second).toBe(first)
  })
})
