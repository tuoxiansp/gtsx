import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex, createCachedGTSXProjectIndexBuilder } from "../src/project-index.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "fixtures/ts-project-scope")
const examplesRoot = join(import.meta.dirname, "../../../examples")

describe("GTSX project index", () => {
  it("describes the selected GTSX project without Studio route or preview concerns", () => {
    const index = buildGTSXProjectIndex({ cwd: fixtureRoot, sourceRoot: "src/corpus" })

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
              frames: [
                { kind: "pure", name: "neutral" },
                { kind: "pure", name: "success" },
              ],
              providers: {},
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
              frames: [
                { kind: "pure", name: "loading" },
                { kind: "pure", name: "error" },
              ],
              providers: {},
              diagnostics: [],
            },
          ],
          diagnostics: [],
        },
      ],
      diagnostics: [],
    })
    expect(JSON.stringify(index)).not.toContain("/gtsx/studio")
    expect(JSON.stringify(index)).not.toContain("urlTemplate")
  })

  it("follows the selected TypeScript project scope", () => {
    const index = buildGTSXProjectIndex({
      cwd: tsProjectScopeRoot,
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })

    expect(index.files.map((file) => file.path)).toEqual([
      "src/app/gtsx/design/Sketch.g.tsx",
      "src/Child.g.tsx",
      "src/Included.g.tsx",
    ])
  })

  it("can include route design roots outside the selected source root", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gtsx-route-design-index-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      mkdirSync(join(cwd, "app/gtsx/design"), { recursive: true })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        ["export default function Card() { return null }", "Card.frames = { ready: { props: {} } }", ""].join("\n"),
      )
      writeFileSync(
        join(cwd, "app/gtsx/design/Sketch.g.tsx"),
        ["export default function Sketch() { return null }", "Sketch.frames = { live: { props: {} } }", ""].join("\n"),
      )

      const index = buildGTSXProjectIndex({
        additionalRoots: ["app/gtsx/design"],
        cwd,
        sourceRoot: "src",
      })

      expect(index.files.map((file) => file.path)).toEqual(["app/gtsx/design/Sketch.g.tsx", "src/Card.g.tsx"])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("records static GTSX component dependencies from TypeScript path aliases", () => {
    const index = buildGTSXProjectIndex({
      cwd: tsProjectScopeRoot,
      tsconfigPath: join(tsProjectScopeRoot, "tsconfig.json"),
    })
    const included = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/Included.g.tsx#default")

    expect(included?.dependencies).toEqual(["src/Child.g.tsx#default"])
  })

  it("records static GTSX component dependencies from JSX imports", () => {
    const index = buildGTSXProjectIndex({ cwd: examplesRoot, sourceRoot: "src/frames" })
    const dashboard = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/frames/stateful/DashboardShell.g.tsx#default")

    expect(dashboard?.dependencies).toEqual(["src/frames/stateful/NotificationBell.g.tsx#default"])
  })

  it("records static GTSX component dependencies through local JSX aliases", () => {
    const index = buildGTSXProjectIndex({ cwd: fixtureRoot, sourceRoot: "src" })
    const aliasImportedDependency = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/AliasImportedDependency.g.tsx#default")

    expect(aliasImportedDependency?.dependencies).toEqual(["src/HookDependencyChild.g.tsx#HookDependencyChild"])
  })

  it("indexes local functions exported from a list when they declare frames", () => {
    const index = buildGTSXProjectIndex({ cwd: fixtureRoot, sourceRoot: "src" })
    const exportList = index.files.find((file) => file.path === "src/ExportList.g.tsx")

    expect(exportList?.components.map((component) => component.coordinate)).toEqual([
      "src/ExportList.g.tsx#ExportListBadge",
    ])
    expect(exportList?.diagnostics).toEqual([])
  })

  it("can reuse a project index briefly for high-frequency Studio route reads", () => {
    const buildProjectIndex = createCachedGTSXProjectIndexBuilder({ ttlMs: 60_000 })
    const first = buildProjectIndex({ cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const second = buildProjectIndex({ cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const differentScope = buildProjectIndex({ cwd: fixtureRoot, sourceRoot: "src" })

    expect(second).toBe(first)
    expect(differentScope).not.toBe(first)
  })

  it("shares the cached project index across provider instances", () => {
    const firstProvider = createCachedGTSXProjectIndexBuilder({ ttlMs: 60_000 })
    const secondProvider = createCachedGTSXProjectIndexBuilder({ ttlMs: 60_000 })
    const first = firstProvider({ cwd: fixtureRoot, sourceRoot: "src/corpus" })
    const second = secondProvider({ cwd: fixtureRoot, sourceRoot: "src/corpus" })

    expect(second).toBe(first)
  })
})
