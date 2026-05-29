import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"

import type { GTSXDiagnostic } from "./analyzer.js"
import { defineGTSXConfig } from "./define-config.js"
import { resolveGTSXConfig } from "./config-model.js"
import type { GTSXConfig, GTSXScriptConfig } from "./config-types.js"

export { resolveGTSXConfig }

export type LoadConfigResult = {
  config?: GTSXConfig
  diagnostics: GTSXDiagnostic[]
}

export function loadGTSXConfig(cwd: string): LoadConfigResult {
  const configPath = ["gtsx.config.ts", "gtsx.config.js", "gtsx.config.cjs"]
    .map((fileName) => join(cwd, fileName))
    .find((candidate) => existsSync(candidate))

  if (!configPath) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "missing-config",
          message: "Missing gtsx.config.ts for adapter commands.",
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

function loadTypeScriptConfig(configPath: string): GTSXConfig {
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
    require: requireGTSXConfigDependency,
  })

  return readDefaultExport(moduleValue.exports)
}

function loadCommonJSConfig(configPath: string): GTSXConfig {
  const moduleValue = { exports: {} as Record<string, unknown> }
  const source = readFileSync(configPath, "utf8")
  vm.runInNewContext(source, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: requireGTSXConfigDependency,
  })
  return readDefaultExport(moduleValue.exports)
}

function requireGTSXConfigDependency(specifier: string): unknown {
  if (specifier === "@gtsx/core") return { defineGTSXConfig }
  throw new Error(`Unsupported config import: ${specifier}`)
}

function readDefaultExport(exportsValue: Record<string, unknown>): GTSXConfig {
  const config = (exportsValue.default ?? exportsValue) as GTSXConfig
  if (!config.preview) {
    throw new Error("Missing preview configuration in gtsx.config.ts.")
  }
  return config
}
