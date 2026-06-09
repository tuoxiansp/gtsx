import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"

import type { RunelightDiagnostic } from "./analyzer.js"
import { defineRunelightConfig } from "./define-config.js"
import { resolveRunelightConfig } from "./config-model.js"
import type { RunelightConfig, RunelightScriptConfig } from "./config-types.js"

export { resolveRunelightConfig }

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
          code: "missing-config",
          message: "Missing runelight.config.ts for adapter commands.",
        },
      ],
    }
  }

  try {
    const config = configPath.endsWith(".ts") ? loadTypeScriptConfig(configPath) : loadCommonJSConfig(configPath)
    return { config, diagnostics: [] }
  } catch (error) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "invalid-config",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}

function loadTypeScriptConfig(configPath: string): RunelightConfig {
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
  if (specifier === "@runelight/core" || specifier === "@runelight/core/define-config") return { defineRunelightConfig }
  throw new Error(`Unsupported config import: ${specifier}`)
}

function readDefaultExport(exportsValue: Record<string, unknown>): RunelightConfig {
  const config = (exportsValue.default ?? exportsValue) as RunelightConfig
  if (!config.host) {
    throw new Error("Missing host configuration in runelight.config.ts.")
  }
  return config
}
