#!/usr/bin/env node

import { readdirSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { spawn } from "node:child_process"

import { analyzeEntry, type GTSXAnalysisResult, type GTSXDiagnostic } from "./analyzer.js"
import { capturePreviewPage } from "./browser-capture.js"
import { loadGTSXConfig } from "./config.js"
import { initGTSX } from "./init.js"
import { discoverGTSXProgramFiles, findNearestTSConfig } from "./project-scope.js"
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

type ProjectSelection = {
  args: string[]
  cwd: string
  tsconfigPath?: string
  diagnostics: GTSXDiagnostic[]
}

const HELP = `gtsx

Usage:
  gtsx init [--dry-run]
  gtsx check [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir> [--json]
  gtsx serve [-p <tsconfig-or-dir>] [--port <port>]
  gtsx capture [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir> [--case <name>|--all] [--gcase <entry.g.tsx#export:case>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
  gtsx strip [--check]
  gtsx diagnose
`

export async function runCLI(args: string[], context: CLIContext): Promise<CLIResult> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stdout: HELP, stderr: context.stderr }
  }

  const projectSelection = resolveProjectSelection(args, context.cwd)
  if (projectSelection.diagnostics.length > 0) {
    return diagnosticsResult(projectSelection.diagnostics)
  }
  args = projectSelection.args
  const cwd = projectSelection.cwd

  if (args[0] === "init") {
    return initGTSX({
      cwd,
      dryRun: args.includes("--dry-run"),
    })
  }

  if (args[0] === "check") {
    const entry = args[1]
    if (!entry) {
      return { exitCode: 1, stdout: context.stdout, stderr: "Missing entry for gtsx check.\n" }
    }

    if (isDirectory(cwd, entry)) {
      if (args.includes("--json")) {
        return { exitCode: 1, stdout: context.stdout, stderr: "Directory JSON output is not supported yet.\n" }
      }

      const entries = discoverGTSXEntries(cwd, entry, projectSelection.tsconfigPath)
      if (entries.length === 0) {
        return diagnosticsResult([
          {
            stage: "contract-extraction",
            code: "no-entries-found",
            message: `No .g.tsx entries found under ${entry}.`,
            file: entry,
          },
        ])
      }

      const results = entries.map((candidate) => analyzeEntry({ cwd, entry: candidate }))
      return {
        exitCode: results.some((result) => result.diagnostics.length > 0) ? 1 : 0,
        stdout: results.map(formatCheckResult).join("\n"),
        stderr: context.stderr,
      }
    }

    if (projectSelection.tsconfigPath && !isEntryInGTSXScope(cwd, entry, projectSelection.tsconfigPath)) {
      return entryOutsideProjectScopeResult(entry)
    }

    const result = analyzeEntry({ cwd, entry })
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
    const config = loadGTSXConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)
    if (!config.config.preview.studioUrl) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-studio-url",
          message: "Add preview.studioUrl to gtsx.config.ts after integrating the /gtsx/studio route.",
        },
      ])
    }

    const port = readOption(args, "--port") ?? "4300"
    const previewServer = await startPreviewServer(config.config.preview.serve, cwd, { port })
    if (previewServer.exitCode !== 0) return previewServer

    return {
      exitCode: 0,
      stdout: `Studio: ${expandUrl(config.config.preview.studioUrl, { entry: "", caseName: "", port })}\n`,
      stderr: previewServer.stderr,
    }
  }

  if (args[0] === "capture") {
    const entry = args[1]
    if (!entry) return { exitCode: 1, stdout: context.stdout, stderr: "Missing entry for gtsx capture.\n" }

    if (isDirectory(cwd, entry)) {
      if (!args.includes("--all")) {
        return diagnosticsResult([
          {
            stage: "browser-capture",
            code: "directory-capture-requires-all",
            message: "Directory capture requires --all so each entry can render a contact sheet.",
            file: entry,
          },
        ])
      }

      const entries = discoverGTSXEntries(cwd, entry, projectSelection.tsconfigPath)
      if (entries.length === 0) {
        return diagnosticsResult([
          {
            stage: "contract-extraction",
            code: "no-entries-found",
            message: `No .g.tsx entries found under ${entry}.`,
            file: entry,
          },
        ])
      }

      const checks = entries.map((candidate) => analyzeEntry({ cwd, entry: candidate }))
      if (checks.some((check) => check.diagnostics.length > 0)) {
        return {
          exitCode: 1,
          stdout: checks.map(formatCheckResult).join("\n"),
          stderr: context.stderr,
        }
      }

      const config = loadGTSXConfig(cwd)
      if (!config.config) return diagnosticsResult(config.diagnostics)

      if (!config.config.preview.allUrl) {
        return diagnosticsResult([
          {
            stage: "adapter-configuration",
            code: "missing-preview-all-url",
            message: "Missing preview.allUrl in gtsx.config.ts for contact sheet capture.",
          },
        ])
      }

      const out = readOption(args, "--out") ?? "gtsx-captures"
      if (out.endsWith(".png")) {
        return diagnosticsResult([
          {
            stage: "browser-capture",
            code: "directory-output-must-be-directory",
            message: "Directory capture writes one PNG per entry, so --out must be a directory.",
          },
        ])
      }

      const port = readOption(args, "--port") ?? "4300"
      const viewport = readOption(args, "--viewport") ?? "1440x900"
      const gcases = readOptions(args, "--gcase")
      const previewServer = await startPreviewServer(config.config.preview.serve, cwd, { port })
      if (previewServer.exitCode !== 0) return previewServer

      try {
        const outputs: string[] = []
        for (const candidate of entries) {
          const outPath = outForDirectoryContactSheet(out, candidate)
          await capturePreviewPage({
            cwd,
            url: expandUrl(config.config.preview.allUrl, { entry: candidate, caseName: "", port, gcases }),
            viewport,
            out: outPath,
          })
          outputs.push(`Captured ${candidate} contact sheet to ${outPath}\n`)
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

    if (projectSelection.tsconfigPath && !isEntryInGTSXScope(cwd, entry, projectSelection.tsconfigPath)) {
      return entryOutsideProjectScopeResult(entry)
    }

    const check = analyzeEntry({ cwd, entry })
    if (check.diagnostics.length > 0) {
      return { exitCode: 1, stdout: formatCheckResult(check), stderr: context.stderr }
    }

    const config = loadGTSXConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const port = readOption(args, "--port") ?? "4300"
    const viewport = readOption(args, "--viewport") ?? "1440x900"
    const out = readOption(args, "--out") ?? "gtsx-capture.png"
    const captureAllCases = args.includes("--all")
    const selectedCase = readOption(args, "--case") ?? check.cases[0]?.name
    const gcases = readOptions(args, "--gcase")

    if (captureAllCases && !config.config.preview.allUrl) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-preview-all-url",
          message: "Missing preview.allUrl in gtsx.config.ts for contact sheet capture.",
        },
      ])
    }

    if (!captureAllCases && !config.config.preview.url) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-preview-url",
          message: "Missing preview.url in gtsx.config.ts for browser capture.",
        },
      ])
    }

    const previewServer = await startPreviewServer(config.config.preview.serve, cwd, { port })
    if (previewServer.exitCode !== 0) return previewServer

    try {
      if (captureAllCases) {
        const outPath = outForEntryContactSheet(out, entry)
        await capturePreviewPage({
          cwd,
          url: expandUrl(config.config.preview.allUrl ?? "", { entry, caseName: "", port, gcases }),
          viewport,
          out: outPath,
        })
        return { exitCode: 0, stdout: `Captured ${entry} contact sheet to ${outPath}\n`, stderr: context.stderr }
      }

      if (!selectedCase) {
        return diagnosticsResult([
          {
            stage: "contract-extraction",
            code: "missing-cases",
            message: `No cases found for ${entry}.`,
            file: entry,
          },
        ])
      }

      await capturePreviewPage({
        cwd,
        url: expandUrl(config.config.preview.url ?? "", { entry, caseName: selectedCase, port, gcases }),
        viewport,
        out,
      })
      return { exitCode: 0, stdout: `Captured ${selectedCase} to ${out}\n`, stderr: context.stderr }
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
    const config = loadGTSXConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const adapter = await runScriptAdapter(config.config, "strip", {
      cwd,
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

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git"])

function resolveProjectSelection(args: string[], cwd: string): ProjectSelection {
  const projectOptionIndex = args.findIndex((arg) => arg === "-p" || arg === "--project")
  if (projectOptionIndex < 0) {
    const tsconfigPath = findNearestTSConfig(cwd)
    if (!tsconfigPath) {
      return { args, cwd, diagnostics: [] }
    }

    return {
      args,
      cwd: dirname(tsconfigPath),
      tsconfigPath,
      diagnostics: [],
    }
  }

  const projectValue = args[projectOptionIndex + 1]
  if (!projectValue) {
    return {
      args,
      cwd,
      diagnostics: [
        {
          stage: "typescript",
          code: "missing-project-option-value",
          message: "Missing value for -p/--project.",
        },
      ],
    }
  }

  const nextArgs = [...args.slice(0, projectOptionIndex), ...args.slice(projectOptionIndex + 2)]
  const projectPath = resolve(cwd, projectValue)
  const projectStat = statOrUndefined(projectPath)
  const tsconfigPath = projectStat?.isDirectory() ? findNearestTSConfig(projectPath) : projectPath

  if (!tsconfigPath || !statOrUndefined(tsconfigPath)?.isFile()) {
    return {
      args: nextArgs,
      cwd,
      diagnostics: [
        {
          stage: "typescript",
          code: "missing-tsconfig",
          message: `Could not resolve a TypeScript project from ${projectValue}.`,
        },
      ],
    }
  }

  return {
    args: nextArgs,
    cwd: dirname(tsconfigPath),
    tsconfigPath,
    diagnostics: [],
  }
}

function isDirectory(cwd: string, target: string): boolean {
  try {
    return statSync(resolve(cwd, target)).isDirectory()
  } catch {
    return false
  }
}

function statOrUndefined(path: string) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

function discoverGTSXEntries(cwd: string, targetDirectory: string, tsconfigPath?: string): string[] {
  if (tsconfigPath) {
    return discoverGTSXProgramFiles({ cwd, root: targetDirectory, tsconfigPath })
  }

  const root = resolve(cwd, targetDirectory)
  const entries: string[] = []

  walk(root)
  return entries
    .map((entryPath) => relative(cwd, entryPath).split(sep).join("/"))
    .sort((left, right) => left.localeCompare(right))

  function walk(directory: string) {
    for (const dirent of readdirSync(directory, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!IGNORED_DISCOVERY_DIRS.has(dirent.name)) {
          walk(join(directory, dirent.name))
        }
        continue
      }

      if (dirent.isFile() && dirent.name.endsWith(".g.tsx")) {
        entries.push(join(directory, dirent.name))
      }
    }
  }
}

function isEntryInGTSXScope(cwd: string, entry: string, tsconfigPath: string): boolean {
  const file = entryFile(entry)
  return discoverGTSXProgramFiles({ cwd, root: ".", tsconfigPath }).includes(file)
}

function entryFile(entry: string): string {
  return entry.split("#", 1)[0] ?? entry
}

function entryOutsideProjectScopeResult(entry: string): CLIResult {
  return diagnosticsResult([
    {
      stage: "typescript",
      code: "entry-outside-project-scope",
      message: `${entryFile(entry)} is not in the selected TypeScript project scope.`,
      file: entryFile(entry),
    },
  ])
}

function readOption(args: string[], optionName: string): string | undefined {
  const index = args.indexOf(optionName)
  return index >= 0 ? args[index + 1] : undefined
}

function readOptions(args: string[], optionName: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === optionName && args[index + 1]) {
      values.push(args[index + 1])
    }
  }
  return values
}

function outForEntryContactSheet(out: string, entry: string): string {
  if (out.endsWith(".png")) return out

  const fileName = entry.split(/[\\/]/).pop()?.replace(/\.g\.tsx$/, ".png") ?? "gtsx-capture.png"
  return join(out, fileName)
}

function outForDirectoryContactSheet(out: string, entry: string): string {
  return join(out, entry.replace(/\.g\.tsx$/, ".png"))
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

export function expandUrl(template: string, params: { entry: string; caseName: string; port: string; gcases?: string[] }): string {
  const replacements: Record<string, string> = {
    entry: params.entry,
    case: params.caseName,
    port: params.port,
    gcase: params.gcases?.map((gcase) => `&gcase=${encodeURIComponent(gcase)}`).join("") ?? "",
  }
  return template.replace(/\{([a-z]+)\}/g, (_match, key: string) => {
    if (key === "gcase") return replacements.gcase
    return encodeURIComponent(replacements[key] ?? "")
  })
}

function diagnosticsResult(diagnostics: GTSXDiagnostic[]): CLIResult {
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

function formatCheckResult(result: GTSXAnalysisResult): string {
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
