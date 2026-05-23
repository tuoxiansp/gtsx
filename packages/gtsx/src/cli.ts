#!/usr/bin/env node

import { join } from "node:path"
import { spawn } from "node:child_process"

import { analyzeEntry } from "./analyzer.js"
import { capturePreviewPage } from "./browser-capture.js"
import { loadGTSXConfig } from "./config.js"
import { initGTSX } from "./init.js"
import { expandCommand, runScriptAdapter } from "./script-adapter.js"

export type CLIContext = {
  cwd: string
  stdout: string
  stderr: string
}

export type CLIResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const HELP = `gtsx

Usage:
  gtsx init [--dry-run]
  gtsx check <entry.g.tsx> [--json]
  gtsx serve <entry.g.tsx> [--case <name>] [--port <port>]
  gtsx capture <entry.g.tsx> [--case <name>|--all] [--viewport 1440x900] [--out <file.png>] [--port <port>]
  gtsx strip [--check]
  gtsx diagnose
`

export async function runCLI(args: string[], context: CLIContext): Promise<CLIResult> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: HELP, stderr: context.stderr }
  }

  if (args[0] === "init") {
    return initGTSX({
      cwd: context.cwd,
      dryRun: args.includes("--dry-run"),
    })
  }

  if (args[0] === "check") {
    const entry = args[1]
    if (!entry) {
      return { exitCode: 1, stdout: context.stdout, stderr: "Missing entry for gtsx check.\n" }
    }

    const result = analyzeEntry({ cwd: context.cwd, entry })
    if (args.includes("--json")) {
      return {
        exitCode: result.diagnostics.length === 0 ? 0 : 1,
        stdout: `${JSON.stringify(result, null, 2)}\n`,
        stderr: context.stderr,
      }
    }

    return {
      exitCode: result.diagnostics.length === 0 ? 0 : 1,
      stdout: formatCheckResult(result),
      stderr: context.stderr,
    }
  }

  if (args[0] === "serve") {
    const entry = args[1]
    if (!entry) return { exitCode: 1, stdout: context.stdout, stderr: "Missing entry for gtsx serve.\n" }

    const check = analyzeEntry({ cwd: context.cwd, entry })
    if (check.diagnostics.length > 0) {
      return { exitCode: 1, stdout: formatCheckResult(check), stderr: context.stderr }
    }

    const config = loadGTSXConfig(context.cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const adapter = await runScriptAdapter(config.config, "serve", {
      cwd: context.cwd,
      entry,
      caseName: readOption(args, "--case"),
      port: readOption(args, "--port"),
    })
    return adapterResult(adapter)
  }

  if (args[0] === "capture") {
    const entry = args[1]
    if (!entry) return { exitCode: 1, stdout: context.stdout, stderr: "Missing entry for gtsx capture.\n" }

    const check = analyzeEntry({ cwd: context.cwd, entry })
    if (check.diagnostics.length > 0) {
      return { exitCode: 1, stdout: formatCheckResult(check), stderr: context.stderr }
    }

    const config = loadGTSXConfig(context.cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const port = readOption(args, "--port") ?? "4300"
    const viewport = readOption(args, "--viewport") ?? "1440x900"
    const out = readOption(args, "--out") ?? "gtsx-capture.png"
    const selectedCases = args.includes("--all")
      ? check.cases.map((testCase) => testCase.name)
      : [readOption(args, "--case") ?? check.cases[0]?.name].filter(Boolean)

    if (!config.config.preview.url) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-preview-url",
          message: "Missing preview.url in gtsx.config.ts for browser capture.",
        },
      ])
    }

    const previewServer = await startPreviewServer(config.config.preview.serve, context.cwd, { port })
    if (previewServer.exitCode !== 0) return previewServer

    try {
      const outputs: string[] = []
      for (const caseName of selectedCases) {
        const outPath = args.includes("--all") ? outForCase(out, caseName) : out
        await capturePreviewPage({
          cwd: context.cwd,
          url: expandUrl(config.config.preview.url, { entry, caseName, port }),
          viewport,
          out: outPath,
        })
        outputs.push(`Captured ${caseName} to ${outPath}\n`)
      }
      return { exitCode: 0, stdout: outputs.join(""), stderr: context.stderr }
    } catch (error) {
      return diagnosticsResult([
        {
          stage: "browser-capture",
          code: "browser-capture-failed",
          message: error instanceof Error ? error.message : String(error),
        },
      ])
    } finally {
      previewServer.stop()
    }
  }

  if (args[0] === "strip") {
    const config = loadGTSXConfig(context.cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const adapter = await runScriptAdapter(config.config, "strip", {
      cwd: context.cwd,
      check: args.includes("--check"),
    })
    return adapterResult(adapter)
  }

  return {
    exitCode: 1,
    stdout: context.stdout,
    stderr: `Unknown command: ${args[0] ?? ""}\n`,
  }
}

function readOption(args: string[], optionName: string): string | undefined {
  const index = args.indexOf(optionName)
  return index >= 0 ? args[index + 1] : undefined
}

function outForCase(out: string, caseName: string): string {
  if (out.endsWith(".png")) {
    return out.replace(/\.png$/, `.${caseName}.png`)
  }

  return join(out, `${caseName}.png`)
}

async function startPreviewServer(
  serveCommand: string | undefined,
  cwd: string,
  params: { port: string },
): Promise<CLIResult & { stop(): void }> {
  if (!serveCommand) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "[adapter-configuration] missing-serve-script: Missing preview.serve in gtsx.config.ts.\n",
      stop() {},
    }
  }

  const child = spawn(expandCommand(serveCommand, { cwd, port: params.port }), {
    cwd,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  let exitCode: number | undefined
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })
  const exitPromise = new Promise<void>((resolve) => {
    child.on("exit", (code) => {
      exitCode = code ?? 0
      resolve()
    })
  })

  await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 500))])

  return {
    exitCode: exitCode && exitCode !== 0 ? exitCode : 0,
    stdout,
    stderr,
    stop() {
      if (exitCode === undefined) child.kill()
    },
  }
}

function expandUrl(template: string, params: { entry: string; caseName: string; port: string }): string {
  const replacements: Record<string, string> = {
    entry: params.entry,
    case: params.caseName,
    port: params.port,
  }
  return template.replace(/\{([a-z]+)\}/g, (_match, key: string) =>
    encodeURIComponent(replacements[key] ?? ""),
  )
}

function diagnosticsResult(diagnostics: ReturnType<typeof analyzeEntry>["diagnostics"]): CLIResult {
  return {
    exitCode: diagnostics.some((diagnostic) => diagnostic.code.startsWith("missing-strip-script")) ? 0 : 1,
    stdout: diagnostics.map((diagnostic) => `[${diagnostic.stage}] ${diagnostic.code}: ${diagnostic.message}`).join("\n") + "\n",
    stderr: "",
  }
}

function adapterResult(adapter: Awaited<ReturnType<typeof runScriptAdapter>>): CLIResult {
  if (adapter.diagnostics.length > 0) return diagnosticsResult(adapter.diagnostics)

  return {
    exitCode: adapter.exitCode,
    stdout: adapter.stdout,
    stderr: adapter.stderr,
  }
}

function formatCheckResult(result: ReturnType<typeof analyzeEntry>): string {
  const lines = [`GTSX ${result.mode} entry: ${result.entry}`]
  for (const testCase of result.cases) {
    lines.push(`- ${testCase.name}`)
  }
  for (const diagnostic of result.diagnostics) {
    lines.push(`[${diagnostic.stage}] ${diagnostic.code}: ${diagnostic.message}`)
  }
  return `${lines.join("\n")}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runCLI(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: "",
    stderr: "",
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.exitCode
}
