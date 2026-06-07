import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { analyzeEntry } from "../src/analyzer.js"
import { runCLI } from "../src/cli.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const framesBeforeExportRoot = join(import.meta.dirname, "fixtures/frames-before-export")
const jsxControlFlowRoot = join(import.meta.dirname, "fixtures/jsx-control-flow")
const tsProjectScopeRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

describe("Runelight analyzer", () => {
  it("discovers pure component frames through component-level metadata", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/Badge.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.frames.map((frame) => frame.name)).toEqual(["neutral", "warning"])
  })

  it("discovers stateful component frames and provider selections", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/UserCard.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("scope")
    expect(result.frames).toEqual([
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
      frames: [],
      variants: ["light", "dark"],
    })
  })

  it("discovers named component frames by file export coordinate", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultiExport.g.tsx#NamedBadge" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.frames.map((frame) => frame.name)).toEqual(["ready"])
  })

  it("discovers frames on local functions exported from a list", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ExportList.g.tsx#ExportListBadge" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.frames.map((frame) => frame.name)).toEqual(["ready"])
  })

  it("recognizes createGScopeHook through type casts", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/CastScopeHook.g.tsx#CastScopeHook" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("scope")
    expect(result.frames.map((frame) => frame.name)).toEqual(["ready"])
  })

  it("allows frames to select imported Runelight providers", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ImportedProvider.g.tsx#ImportedProviderPanel" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.frames).toEqual([
      {
        kind: "pure",
        name: "light",
        providers: ["ThemeProvider"],
      },
    ])
    expect(result.providers.ThemeProvider.frames).toEqual([])
  })

  it("allows components to call imported Runelight scope hooks", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ImportedScopeHook.g.tsx#ImportedScopeConsumer" })

    expect(result.diagnostics).toEqual([])
    expect(result.mode).toBe("pure")
    expect(result.frames).toEqual([
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
    expect(result.frames.map((frame) => frame.name)).toEqual(["ready"])
  })

  it("reports contract diagnostics for malformed entries", () => {
    const missingDefault = analyzeEntry({ cwd: fixtureRoot, entry: "src/MissingDefault.g.tsx#default" })
    const multipleScopes = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultipleScopes.g.tsx" })
    const dynamicFrames = analyzeEntry({ cwd: fixtureRoot, entry: "src/DynamicFrames.g.tsx" })
    const legacyScopeFrames = analyzeEntry({ cwd: fixtureRoot, entry: "src/LegacyScopeFrames.g.tsx" })
    const nonRunelightHook = analyzeEntry({ cwd: fixtureRoot, entry: "src/NonRunelightHook.g.tsx" })
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
    const framesBeforeExport = analyzeEntry({ cwd: framesBeforeExportRoot, entry: "src/FramesBeforeExport.g.tsx" })

    expect(missingDefault.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-default-export", stage: "contract-extraction" }),
    )
    expect(multipleScopes.diagnostics).toContainEqual(
      expect.objectContaining({ code: "multiple-scope-hooks", stage: "contract-extraction" }),
    )
    expect(dynamicFrames.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-static-frame-key", stage: "contract-extraction" }),
    )
    expect(legacyScopeFrames.diagnostics).toContainEqual(
      expect.objectContaining({ code: "scope-hook-frames-unsupported", stage: "contract-extraction" }),
    )
    expect(nonRunelightHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(reactMemberHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(helperHook.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(localHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(importedHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(aliasHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(aliasChainHookDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(aliasImportedDependency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "non-runelight-hook", stage: "contract-extraction" }),
    )
    expect(aliasPureDependency.diagnostics).toEqual([])
    expect(missingProviderVariant.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-provider-variant-frames", stage: "contract-extraction" }),
    )
    expect(thinWrapper.diagnostics).toEqual([])
    expect(framesBeforeExport.diagnostics).toContainEqual(
      expect.objectContaining({ code: "frames-before-component-export", stage: "contract-extraction" }),
    )
  })

  it("allows provider variant projection frames without injecting provider values", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ProviderVariantProjection.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.frames).toEqual([
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
      frames: [],
      variants: ["login", "anonymous"],
    })
  })

  it("warns when provider-derived props flow into unmarked child projection frames", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ProviderProjectionParent.g.tsx" })

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "unmarked-provider-variant-projection",
        severity: "warning",
        stage: "contract-extraction",
      }),
    ])
  })

  it("does not warn when child projection frames mark the provider variants", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ProviderProjectionCoveredParent.g.tsx" })

    expect(result.diagnostics).toEqual([])
  })

  it("allows one frame to explicitly cover multiple provider variants", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/MultiVariantProviderFrame.g.tsx" })

    expect(result.diagnostics).toEqual([])
    expect(result.frames).toEqual([
      {
        kind: "pure",
        name: "loading",
        providerVariants: { LoginProvider: ["login", "anonymous"] },
        providers: ["LoginProvider"],
      },
    ])
  })

  it("does not let child projection frames replace parent provider coverage", () => {
    const result = analyzeEntry({ cwd: fixtureRoot, entry: "src/ProviderProjectionDelegatingMissingCoverage.g.tsx" })

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-provider-variant-frames", stage: "contract-extraction" }),
    )
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "unmarked-provider-variant-projection", severity: "warning" }),
    )
  })

  it("checks JSX tree reachability against props, scope, and Runelight context frames", () => {
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByProps" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByScope" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByContext" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByMapItem" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByMapItemNegation" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstMap" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstMapItem" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstBoolean" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstObject" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstComparison" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByLocalStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstWithoutConstAssertion" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstObjectSpread" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStaticConstArraySpread" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByLocalStaticSpread" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByImportedStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByNamespaceImportedStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByBarrelImportedStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByStarAndAliasImportedStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByNamespaceReExportedStaticConst" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByImportedStaticSpread" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredByRenderProp" }).diagnostics).toEqual([])
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#CoveredBySlot" }).diagnostics).toEqual([])

    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByProps" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByMapItem" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByStaticConstMapItem" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByStaticConstObject" }).diagnostics).toContainEqual(
      expect.objectContaining({ code: "uncovered-jsx-branch", stage: "contract-extraction" }),
    )
    expect(analyzeEntry({ cwd: jsxControlFlowRoot, entry: "src/Branches.g.tsx#UncoveredByStaticConstObjectSpreadOverride" }).diagnostics).toContainEqual(
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

  it("prints stable JSON from runelight check without invoking an adapter", async () => {
    const result = await runCLI(["check", "src/Badge.g.tsx", "--json"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "pure",
      frames: [{ name: "neutral" }, { name: "warning" }],
      diagnostics: [],
    })
  })

  it("keeps projection warnings non-blocking in runelight check", async () => {
    const result = await runCLI(["check", "src/ProviderProjectionParent.g.tsx"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("[contract-extraction warning] unmarked-provider-variant-projection")
  })

  it("checks every Runelight entry under a directory", async () => {
    const result = await runCLI(["check", "src/corpus"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/corpus/Badge.g.tsx")
    expect(result.stdout).toContain("Runelight pure entry: src/corpus/StatusPanel.g.tsx")
    expect(result.stdout).toContain("- neutral")
    expect(result.stdout).toContain("- error")
  })

  it("checks Runelight design entries in the TypeScript project scope", async () => {
    const result = await runCLI(["check", "src"], {
      cwd: tsProjectScopeRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/app/runelight/design/Sketch.g.tsx")
    expect(result.stdout).toContain("- live")
  })
})
