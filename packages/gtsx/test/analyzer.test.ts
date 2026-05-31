import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { analyzeEntry } from "../src/analyzer.js"
import { runCLI } from "../src/cli.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const jsxControlFlowRoot = join(import.meta.dirname, "fixtures/jsx-control-flow")

describe("GTSX analyzer", () => {
  it("discovers pure component cases through component-level metadata", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/Badge.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["neutral", "warning"])
  })

  it("discovers stateful component cases and provider selections", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/UserCard.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("scope")
    expect(result.cases).toEqual([
      {
        kind: "scope",
        name: "loading",
        providerVariants: { ThemeProvider: "light" },
        providers: ["ThemeProvider"],
      },
      {
        kind: "scope",
        name: "ready",
        providerVariants: { ThemeProvider: "dark" },
        providers: ["ThemeProvider"],
      },
    ])
    expect(result.providers.ThemeProvider).toEqual({
      name: "ThemeProvider",
      cases: [],
      variants: ["light", "dark"],
    })
  })

  it("discovers named component cases by file export coordinate", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultiExport.g.tsx#NamedBadge" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["ready"])
  })

  it("discovers cases on local functions exported from a list", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ExportList.g.tsx#ExportListBadge" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["ready"])
  })

  it("recognizes createGScopeHook through type casts", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/CastScopeHook.g.tsx#CastScopeHook" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("scope")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["ready"])
  })

  it("allows cases to select imported GTSX providers", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ImportedProvider.g.tsx#ImportedProviderPanel" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases).toEqual([
      {
        kind: "pure",
        name: "light",
        providers: ["ThemeProvider"],
      },
    ])
    expect(result.providers.ThemeProvider.cases).toEqual([])
  })

  it("allows components to call imported GTSX scope hooks", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ImportedScopeHook.g.tsx#ImportedScopeConsumer" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases).toEqual([
      {
        kind: "pure",
        name: "ready",
        providers: ["ImportedScopeProvider"],
      },
    ])
  })

  it("accepts named-only component files without requiring a default export", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/MissingDefault.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.cases.map((testCase) => testCase.name)).toEqual(["ready"])
  })

  it("reports contract diagnostics for malformed entries", () => {
    const missingDefault = analyzeEntry({ cwd: fixtureRoot, entry: "src/MissingDefault.g.tsx#default" })
    const multipleScopes = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultipleScopes.g.tsx" })
    const dynamicCases = analyzeEntry({ cwd: fixtureRoot, entry: "src/DynamicCases.g.tsx" })
    const legacyScopeCases = analyzeEntry({ cwd: fixtureRoot, entry: "src/LegacyScopeCases.g.tsx" })
    const nonGTSXHook = analyzeEntry({ cwd: fixtureRoot, entry: "src/NonGTSXHook.g.tsx" })
    const reactMemberHook = analyzeEntry({ cwd: fixtureRoot, entry: "src/ReactMemberHook.g.tsx" })
    const helperHook = analyzeEntry({ cwd: fixtureRoot, entry: "src/HelperHook.g.tsx" })
    const localHookDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/LocalHookDependency.g.tsx" })
    const importedHookDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/ImportedHookDependency.g.tsx" })
    const aliasHookDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/AliasHookDependency.g.tsx" })
    const aliasChainHookDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/AliasChainHookDependency.g.tsx" })
    const aliasImportedDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/AliasImportedDependency.g.tsx" })
    const aliasPureDependency = analyzeEntry({ cwd: fixtureRoot, entry: "src/AliasPureDependency.g.tsx" })
    const missingProviderVariant = analyzeEntry({ cwd: fixtureRoot, entry: "src/MissingProviderVariant.g.tsx" })
    const thinWrapper = analyzeEntry({ cwd: fixtureRoot, entry: "src/ThinWrapper.g.tsx" })

    expect(missingDefault.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-default-export", stage: "contract-extraction" }),
    )
    expect(multipleScopes.diagnostics).toContainEqual(
      expect.objectContaining({ code: "multiple-scope-hooks", stage: "contract-extraction" }),
    )
    expect(dynamicCases.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-static-case-key", stage: "contract-extraction" }),
    )
    expect(legacyScopeCases.diagnostics).toContainEqual(
      expect.objectContaining({ code: "scope-hook-cases-unsupported", stage: "contract-extraction" }),
    )
    expect(nonGTSXHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(reactMemberHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(helperHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(localHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(importedHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(aliasHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(aliasChainHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(aliasImportedDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-gtsx-hook", stage: "contract-extraction" }),
    )
    expect(aliasPureDependency.diagnostics).toEqual([])
    expect(missingProviderVariant.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-provider-variant-cases", stage: "contract-extraction" }),
    )
    expect(thinWrapper.diagnostics).toEqual([])
  })

  it("allows provider variant projection cases without injecting provider values", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ProviderVariantProjection.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.cases).toEqual([
      {
        kind: "pure",
        name: "loginName",
        providerVariants: { LoginProvider: "login" },
      },
      {
        kind: "pure",
        name: "anonymousName",
        providerVariants: { LoginProvider: "anonymous" },
      },
    ])
    expect(result.providers.LoginProvider).toEqual({
      name: "LoginProvider",
      cases: [],
      variants: ["login", "anonymous"],
    })
  })

  it("checks JSX tree reachability against props, scope, and GTSX context cases", () => {
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByProps" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByScope" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByContext" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByMapItem" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByMapItemNegation" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByRenderProp" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredBySlot" }).diagnostics).toEqual([])

    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByProps" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByMapItem" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#OpaqueByHelper" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "opaque-jsx-control-flow", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#OpaqueByMapHelper" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "opaque-jsx-control-flow", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#OpaqueBySwitch" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "opaque-jsx-control-flow", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#OpaqueByStoredJSX" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "opaque-jsx-control-flow", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#OpaqueByForOf" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "opaque-jsx-control-flow", stage: "contract-extraction" }),
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

  it("checks every GTSX entry under a directory", async () => {
    const result = await runCLI(["check", "src/corpus"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("GTSX pure entry: src/corpus/Badge.g.tsx")
    expect(result.stdout).toContain("GTSX pure entry: src/corpus/StatusPanel.g.tsx")
    expect(result.stdout).toContain("- neutral")
    expect(result.stdout).toContain("- error")
  })
})
