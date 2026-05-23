import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"

import type { GTSXDiagnostic } from "./analyzer.js"

export type GTSXScriptConfig = {
  adapter: "script"
  scripts: {
    serve?: string
    capture?: string
    strip?: string
    diagnose?: string
  }
}

export type GTSXConfig = GTSXScriptConfig

export type LoadConfigResult = {
  config?: GTSXConfig
  diagnostics: GTSXDiagnostic[]
}

export function defineGTSXConfig(config: GTSXConfig): GTSXConfig {
  return config
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
    require: (specifier: string) => {
      if (specifier === "gtsx") return { defineGTSXConfig }
      throw new Error(`Unsupported config import: ${specifier}`)
    },
  })

  return readDefaultExport(moduleValue.exports)
}

function loadCommonJSConfig(configPath: string): GTSXConfig {
  const moduleValue = { exports: {} as Record<string, unknown> }
  const source = readFileSync(configPath, "utf8")
  vm.runInNewContext(source, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: (specifier: string) => {
      if (specifier === "gtsx") return { defineGTSXConfig }
      throw new Error(`Unsupported config import: ${specifier}`)
    },
  })
  return readDefaultExport(moduleValue.exports)
}

function readDefaultExport(exportsValue: Record<string, unknown>): GTSXConfig {
  const config = (exportsValue.default ?? exportsValue) as GTSXConfig
  if (config.adapter !== "script") {
    throw new Error("Only the script adapter is implemented in this GTSX build.")
  }
  return config
}
