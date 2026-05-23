import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { analyzeEntry } from "../src/analyzer.js"
import { runCLI } from "../src/cli.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")

describe("GTSX analyzer", () => {
  it("discovers pure component cases through component-level metadata", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/Badge.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["neutral", "warning"])
  })

  it("discovers scope cases and provider selections", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/UserCard.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("scope")
    expect(result.cases).toEqual([
      {
        kind: "scope",
        name: "loading",
        providers: { ThemeGTSXProvider: "light" },
      },
      {
        kind: "scope",
        name: "ready",
        providers: { ThemeGTSXProvider: "dark" },
      },
    ])
    expect(result.providers.ThemeGTSXProvider.cases).toEqual(["light", "dark"])
  })

  it("reports contract diagnostics for malformed entries", () => {
    const missingDefault = analyzeEntry({ cwd: fixtureRoot, entry: "src/MissingDefault.g.tsx" })
    const multipleScopes = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultipleScopes.g.tsx" })
    const dynamicCases = analyzeEntry({ cwd: fixtureRoot, entry: "src/DynamicCases.g.tsx" })

    expect(missingDefault.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-default-export", stage: "contract-extraction" }),
    )
    expect(multipleScopes.diagnostics).toContainEqual(
      expect.objectContaining({ code: "multiple-scope-hooks", stage: "contract-extraction" }),
    )
    expect(dynamicCases.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-static-case-key", stage: "contract-extraction" }),
    )
  })

  it("prints stable JSON from gtsx check without invoking an adapter", async () => {
    const result = await runCLI(["check", "src/Badge.g.tsx", "--json"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "pure",
      cases: [{ name: "neutral" }, { name: "warning" }],
      diagnostics: [],
    })
  })
})
