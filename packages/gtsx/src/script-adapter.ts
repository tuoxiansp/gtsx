import { exec } from "node:child_process"
import { promisify } from "node:util"

import type { GTSXDiagnostic, GTSXDiagnosticStage } from "./analyzer.js"
import type { GTSXScriptConfig } from "./config.js"

const execAsync = promisify(exec)

export type ScriptAdapterAction = "serve" | "capture" | "strip" | "diagnose"

export type ScriptAdapterParams = {
  cwd: string
  entry?: string
  caseName?: string
  port?: string
  viewport?: string
  out?: string
  check?: boolean
}

export type ScriptAdapterResult = {
  exitCode: number
  stdout: string
  stderr: string
  diagnostics: GTSXDiagnostic[]
}

export async function runScriptAdapter(
  config: GTSXScriptConfig,
  action: ScriptAdapterAction,
  params: ScriptAdapterParams,
): Promise<ScriptAdapterResult> {
  const template = action === "serve" ? config.preview.serve : undefined
  if (!template) {
    return {
      exitCode: action === "strip" ? 0 : 1,
      stdout: "",
      stderr: "",
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: `missing-${action}-script`,
          message:
            action === "strip"
              ? "No strip script is configured; preview metadata may ship in production bundles."
              : `No ${action} script is configured in gtsx.config.ts.`,
        },
      ],
    }
  }

  const command = expandCommand(template, params)
  try {
    const result = await execAsync(command, { cwd: params.cwd })
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      diagnostics: [],
    }
  } catch (error) {
    const processError = error as Error & {
      code?: number
      stdout?: string
      stderr?: string
    }
    return {
      exitCode: typeof processError.code === "number" ? processError.code : 1,
      stdout: processError.stdout ?? "",
      stderr: processError.stderr ?? processError.message,
      diagnostics: [
        {
          stage: stageForAction(action),
          code: `${action}-script-failed`,
          message: processError.stderr || processError.message,
          ...(params.caseName ? { caseName: params.caseName } : {}),
        },
      ],
    }
  }
}

export function expandCommand(template: string, params: ScriptAdapterParams): string {
  const replacements: Record<string, string> = {
    entry: params.entry ?? "",
    case: params.caseName ?? "",
    port: params.port ?? "",
    viewport: params.viewport ?? "",
    out: params.out ?? "",
    check: params.check ? "true" : "false",
  }

  return template.replace(/\{([a-z]+)\}/g, (_match, key: string) => shellQuote(replacements[key] ?? ""))
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]*$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

function stageForAction(action: ScriptAdapterAction): GTSXDiagnosticStage {
  if (action === "capture") return "browser-capture"
  if (action === "serve") return "preview-environment-loading"
  if (action === "strip") return "project-compilation"
  return "adapter-configuration"
}
