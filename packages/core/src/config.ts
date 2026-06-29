import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import vm from "node:vm"

import type { RunelightDiagnostic } from "./contract.js"
import { defineRunelightConfig } from "./define-config.js"
import {
  isRunelightHostCommandWithPortPlaceholder,
  resolveRunelightConfig,
  runelightGeneratedRootFromEntryRoot,
} from "./config-model.js"
import type { RunelightConfig, RunelightProjectConfig } from "./config-types.js"

export { resolveRunelightConfig, runelightGeneratedRootFromEntryRoot }
export type { ResolvedRunelightConfig, RunelightConfig, RunelightProjectConfig } from "./config-types.js"

const require = createRequire(import.meta.url)

export type LoadConfigResult = {
  config?: RunelightConfig
  diagnostics: RunelightDiagnostic[]
}

export function loadRunelightConfig(cwd: string): LoadConfigResult {
  const configPath = ["runelight.config.ts", "runelight.config.js", "runelight.config.cjs"]
    .map((fileName) => join(cwd, fileName))
    .find((candidate) => existsSync(candidate))

  if (!configPath) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "missing-config",
          message: "Missing runelight.config.ts for adapter commands.",
        },
      ],
    }
  }

  try {
    const config = configPath.endsWith(".ts") ? loadTypeScriptConfig(configPath) : loadCommonJSConfig(configPath)
    const diagnostics = validateLoadedRunelightConfig(config)
    if (diagnostics.length > 0) return { diagnostics }

    return { config, diagnostics: [] }
  } catch (error) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "invalid-config",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}

function loadTypeScriptConfig(configPath: string): RunelightConfig {
  const ts = loadTypeScript()
  const source = readFileSync(configPath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: configPath,
  }).outputText

  const moduleValue = { exports: {} as Record<string, unknown> }
  vm.runInNewContext(compiled, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: requireRunelightConfigDependency,
  })

  return readDefaultExport(moduleValue.exports)
}

function loadTypeScript(): typeof import("typescript") {
  return require("typescript") as typeof import("typescript")
}

function loadCommonJSConfig(configPath: string): RunelightConfig {
  const moduleValue = { exports: {} as Record<string, unknown> }
  const source = readFileSync(configPath, "utf8")
  vm.runInNewContext(source, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: requireRunelightConfigDependency,
  })
  return readDefaultExport(moduleValue.exports)
}

function requireRunelightConfigDependency(specifier: string): unknown {
  if (specifier === "@runelight/core") return { defineRunelightConfig }
  throw new Error(`Unsupported config import: ${specifier}`)
}

function readDefaultExport(exportsValue: Record<string, unknown>): RunelightConfig {
  return (exportsValue.default ?? exportsValue) as RunelightConfig
}

function validateLoadedRunelightConfig(config: RunelightConfig): RunelightDiagnostic[] {
  const diagnostics: RunelightDiagnostic[] = []
  const candidate = config as Partial<RunelightConfig>

  if (!Array.isArray(candidate.contracts) || candidate.contracts.length === 0) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "missing-contracts",
      message: 'Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].',
    })
  } else if (!candidate.contracts.every(isNonEmptyString)) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-contracts",
      message: 'contracts in runelight.config.ts must be string specifiers, for example contracts: ["@runelight/react/contract"].',
    })
  }
  if (!candidate.project || !isNonEmptyString((candidate.project as Partial<RunelightProjectConfig>).entryRoot)) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "missing-entry-root",
      message: 'Add project.entryRoot to runelight.config.ts, for example project: { entryRoot: "src/app/runelight" } for src-based projects.',
    })
  }
  if (!candidate.project || !isNonEmptyString((candidate.project as Partial<RunelightProjectConfig>).sourceRoot)) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "missing-source-root",
      message: 'Add project.sourceRoot to runelight.config.ts, for example project: { sourceRoot: "src" } or project: { sourceRoot: "." }.',
    })
  }
  if (candidate.host?.command !== undefined && !isRunelightHostCommandWithPortPlaceholder(candidate.host.command)) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-host-command",
      message: "host.command in runelight.config.ts must include the {port} placeholder so Runelight can choose and substitute the Host port.",
    })
  }

  return diagnostics
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
