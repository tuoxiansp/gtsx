import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { buildGTSXProjectIndex } from "../src/project-index.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const tsProjectScopeRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

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

    expect(index.files.map((file) => file.path)).toEqual(["src/Included.g.tsx"])
  })
})
