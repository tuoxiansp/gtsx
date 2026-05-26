import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex, createCachedGTSXProjectIndexBuilder } from "../src/project-index.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "fixtures/ts-project-scope")
const examplesRoot = join(import.meta.dirname, "../../../examples")

describe("GTSX project index", () => {
  it("describes the selected GTSX project without Studio route or preview concerns", () => {
    const index = buildGTSXProjectIndex({ cwd: fixtureRoot, projectRoot: "src/corpus" })

    expect(index).toEqual({
      version: 1,
      files: [
        {
          path: "src/corpus/Badge.g.tsx",
          components: [
            {
              coordinate: "src/corpus/Badge.g.tsx#default",
              filePath: "src/corpus/Badge.g.tsx",
              exportName: "default",
              componentName: "Badge",
              mode: "pure",
              cases: [
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
          components: [
            {
              coordinate: "src/corpus/StatusPanel.g.tsx#default",
              filePath: "src/corpus/StatusPanel.g.tsx",
              exportName: "default",
              componentName: "StatusPanel",
              mode: "pure",
              cases: [
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

    expect(index.files.map((file) => file.path)).toEqual(["src/Child.g.tsx", "src/Included.g.tsx"])
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
    const index = buildGTSXProjectIndex({ cwd: examplesRoot, projectRoot: "src/cases" })
    const dashboard = index.files
      .flatMap((file) => file.components)
      .find((component) => component.coordinate === "src/cases/stateful/DashboardShell.g.tsx#default")

    expect(dashboard?.dependencies).toEqual(["src/cases/stateful/NotificationBell.g.tsx#default"])
  })

  it("can reuse a project index briefly for high-frequency Studio route reads", () => {
    const buildProjectIndex = createCachedGTSXProjectIndexBuilder({ ttlMs: 60_000 })
    const first = buildProjectIndex({ cwd: fixtureRoot, projectRoot: "src/corpus" })
    const second = buildProjectIndex({ cwd: fixtureRoot, projectRoot: "src/corpus" })
    const differentScope = buildProjectIndex({ cwd: fixtureRoot, projectRoot: "src" })

    expect(second).toBe(first)
    expect(differentScope).not.toBe(first)
  })
})
