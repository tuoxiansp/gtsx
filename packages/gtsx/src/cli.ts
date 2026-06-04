#!/usr/bin/env node

import { realpathSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

import { analyzeEntry, type GTSXAnalysisResult, type GTSXDiagnostic } from "./analyzer.js"
import { capturePreviewPage } from "./browser-capture.js"
import { loadGTSXConfig } from "./config.js"
import { initGTSX } from "./init.js"
import { buildGTSXProjectIndex } from "./project-index.js"
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

type EntryResolution = {
  entries: string[]
  diagnostics: GTSXDiagnostic[]
}

const HELP = `gtsx

Usage:
  gtsx init [--dry-run]
  gtsx check [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir> [--json]
  gtsx serve [-p <tsconfig-or-dir>] [--port <port>]
  gtsx capture [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir> [--frame <name>|--all] [--gframe <entry.g.tsx#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
  gtsx strip [--check]
  gtsx diagnose
`

const DEFAULT_PREVIEW_READY_TIMEOUT_MS = 180_000
const DEFAULT_PREVIEW_READY_REQUEST_TIMEOUT_MS = 10_000

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

      return checkResolvedEntries(cwd, discoverGTSXEntryCoordinates(cwd, entry, projectSelection.tsconfigPath), {
        fallbackFile: entry,
        json: false,
        stderr: context.stderr,
      })
    }

    if (projectSelection.tsconfigPath && !isEntryInGTSXScope(cwd, entry, projectSelection.tsconfigPath)) {
      return entryOutsideProjectScopeResult(entry)
    }

    return checkResolvedEntries(cwd, resolveGTSXEntryCoordinates(cwd, entry, projectSelection.tsconfigPath), {
      fallbackFile: entry,
      json: args.includes("--json"),
      stderr: context.stderr,
    })
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
    const studioUrl = expandUrl(config.config.preview.studioUrl, { entry: "", frameName: "", port })
    const previewServer = await startPreviewServer(config.config.preview.serve, cwd, { port, readyUrl: studioUrl })
    if (previewServer.exitCode !== 0) return previewServer

    return {
      exitCode: 0,
      stdout: `Studio: ${studioUrl}\n`,
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

      const resolvedEntries = discoverGTSXEntryCoordinates(cwd, entry, projectSelection.tsconfigPath)
      if (resolvedEntries.entries.length === 0) {
        return diagnosticsResult(nonEmptyDiagnostics(resolvedEntries.diagnostics, entry))
      }

      const checks = resolvedEntries.entries.map((candidate) => analyzeEntry({ cwd, entry: candidate }))
      if (hasErrorDiagnostics(resolvedEntries.diagnostics) || checks.some((check) => hasErrorDiagnostics(check.diagnostics))) {
        return {
          exitCode: 1,
          stdout: [checks.map(formatCheckResult).join("\n"), formatDiagnostics(resolvedEntries.diagnostics)].join(""),
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
      const gframes = readOptions(args, "--gframe")
      const readyUrl = expandUrl(config.config.preview.allUrl, {
        entry: resolvedEntries.entries[0] ?? "",
        frameName: "",
        port,
        gframes,
      })
      const previewServer = await startPreviewServer(config.config.preview.serve, cwd, {
        port,
        readyUrl,
        detached: true,
      })
      if (previewServer.exitCode !== 0) return previewServer

      try {
        const outputs: string[] = []
        for (const candidate of resolvedEntries.entries) {
          const outPath = outForDirectoryContactSheet(out, candidate)
          await capturePreviewPage({
            cwd,
            url: expandUrl(config.config.preview.allUrl, { entry: candidate, frameName: "", port, gframes }),
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

    const resolvedEntry = resolveGTSXEntryCoordinates(cwd, entry, projectSelection.tsconfigPath)
    if (resolvedEntry.entries.length === 0) {
      return diagnosticsResult(nonEmptyDiagnostics(resolvedEntry.diagnostics, entry))
    }
    if (resolvedEntry.entries.length > 1) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          code: "ambiguous-entry-coordinate",
          message: `${entry} contains multiple GTSX component exports; pass one explicit coordinate such as ${resolvedEntry.entries[0]}.`,
          file: entry,
        },
      ])
    }

    const selectedEntry = resolvedEntry.entries[0] ?? entry
    const check = analyzeEntry({ cwd, entry: selectedEntry })
    if (hasErrorDiagnostics(check.diagnostics)) {
      return { exitCode: 1, stdout: formatCheckResult(check), stderr: context.stderr }
    }

    const config = loadGTSXConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const port = readOption(args, "--port") ?? "4300"
    const viewport = readOption(args, "--viewport") ?? "1440x900"
    const out = readOption(args, "--out") ?? "gtsx-capture.png"
    const captureAllFrames = args.includes("--all")
    const selectedFrame = readOption(args, "--frame") ?? check.frames[0]?.name
    const gframes = readOptions(args, "--gframe")

    if (captureAllFrames && !config.config.preview.allUrl) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-preview-all-url",
          message: "Missing preview.allUrl in gtsx.config.ts for contact sheet capture.",
        },
      ])
    }

    if (!captureAllFrames && !config.config.preview.url) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          code: "missing-preview-url",
          message: "Missing preview.url in gtsx.config.ts for browser capture.",
        },
      ])
    }

    if (!captureAllFrames && !selectedFrame) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          code: "missing-frames",
          message: `No frames found for ${entry}.`,
          file: entry,
        },
      ])
    }

    const captureUrl = captureAllFrames
      ? expandUrl(config.config.preview.allUrl ?? "", { entry: selectedEntry, frameName: "", port, gframes })
      : expandUrl(config.config.preview.url ?? "", { entry: selectedEntry, frameName: selectedFrame ?? "", port, gframes })
    const previewServer = await startPreviewServer(config.config.preview.serve, cwd, {
      port,
      readyUrl: captureUrl,
      detached: true,
    })
    if (previewServer.exitCode !== 0) return previewServer

    try {
      if (captureAllFrames) {
        const outPath = outForEntryContactSheet(out, selectedEntry)
        await capturePreviewPage({
          cwd,
          url: captureUrl,
          viewport,
          out: outPath,
        })
        return { exitCode: 0, stdout: `Captured ${selectedEntry} contact sheet to ${outPath}\n`, stderr: context.stderr }
      }

      await capturePreviewPage({
        cwd,
        url: captureUrl,
        viewport,
        out,
      })
      return { exitCode: 0, stdout: `Captured ${selectedFrame} to ${out}\n`, stderr: context.stderr }
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

function resolveProjectSelection(args: string[], cwd: string): ProjectSelection {
  const projectOptionIndex = args.findIndex((arg) => arg === "-p" || arg === "--project")
  if (projectOptionIndex < 0) {
    const configProjectTSConfig = resolveConfiguredTSConfig(cwd)
    if (configProjectTSConfig) {
      return {
        args,
        cwd: dirname(configProjectTSConfig),
        tsconfigPath: configProjectTSConfig,
        diagnostics: [],
      }
    }

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

function resolveConfiguredTSConfig(cwd: string): string | undefined {
  const config = loadGTSXConfig(cwd)
  if (!config.config?.project?.tsconfig) return undefined

  const tsconfigPath = resolve(cwd, config.config.project.tsconfig)
  return statOrUndefined(tsconfigPath)?.isFile() ? tsconfigPath : undefined
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

function resolveGTSXEntryCoordinates(cwd: string, entry: string, tsconfigPath?: string): EntryResolution {
  if (hasExplicitExportCoordinate(entry)) {
    return { entries: [entry], diagnostics: [] }
  }

  return discoverGTSXFileEntryCoordinates(cwd, entry, tsconfigPath)
}

function discoverGTSXEntryCoordinates(cwd: string, targetDirectory: string, tsconfigPath?: string): EntryResolution {
  const index = buildGTSXProjectIndex({ cwd, sourceRoot: targetDirectory, tsconfigPath })
  return {
    entries: index.files.flatMap((file) => file.components.map((component) => component.coordinate)),
    diagnostics: index.files.filter((file) => file.components.length === 0).flatMap((file) => file.diagnostics),
  }
}

function discoverGTSXFileEntryCoordinates(cwd: string, entry: string, tsconfigPath?: string): EntryResolution {
  const file = normalizeProjectPath(entryFile(entry))
  const sourceRoot = dirname(file)
  const index = buildGTSXProjectIndex({
    cwd,
    sourceRoot: sourceRoot === "." ? "." : sourceRoot,
    tsconfigPath,
  })
  const indexedFile = index.files.find((candidate) => candidate.path === file)

  if (!indexedFile) {
    return {
      entries: [],
      diagnostics: [
        {
          stage: "contract-extraction",
          code: "entry-not-found",
          message: `GTSX entry does not exist: ${entry}.`,
          file: entry,
        },
      ],
    }
  }

  return {
    entries: indexedFile.components.map((component) => component.coordinate),
    diagnostics: indexedFile.components.length === 0 ? indexedFile.diagnostics : [],
  }
}

function hasExplicitExportCoordinate(entry: string): boolean {
  return entry.includes("#")
}

function normalizeProjectPath(filePath: string): string {
  return filePath.split(sep).join("/")
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

function checkResolvedEntries(
  cwd: string,
  resolution: EntryResolution,
  options: { fallbackFile: string; json: boolean; stderr: string },
): CLIResult {
  if (resolution.entries.length === 0) {
    return diagnosticsResult(nonEmptyDiagnostics(resolution.diagnostics, options.fallbackFile))
  }

  const results = resolution.entries.map((candidate) => analyzeEntry({ cwd, entry: candidate }))
  const diagnostics = [...resolution.diagnostics, ...results.flatMap((result) => result.diagnostics)]
  const hasErrors = hasErrorDiagnostics(diagnostics)
  if (options.json) {
    const stdout =
      results.length === 1 && resolution.diagnostics.length === 0
        ? `${JSON.stringify(results[0], null, 2)}\n`
        : `${JSON.stringify({ entries: results, diagnostics }, null, 2)}\n`

    return {
      exitCode: hasErrors ? 1 : 0,
      stdout,
      stderr: options.stderr,
    }
  }

  return {
    exitCode: hasErrors ? 1 : 0,
    stdout: [results.map(formatCheckResult).join("\n"), formatDiagnostics(resolution.diagnostics)].join(""),
    stderr: options.stderr,
  }
}

function nonEmptyDiagnostics(diagnostics: GTSXDiagnostic[], target: string): GTSXDiagnostic[] {
  if (diagnostics.length > 0) return diagnostics

  return [
    {
      stage: "contract-extraction",
      code: "no-entries-found",
      message: `No .g.tsx entries found under ${target}.`,
      file: target,
    },
  ]
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

  const fileName = outputPathForEntry(entry).split(/[\\/]/).pop() ?? "gtsx-capture.png"
  return join(out, fileName)
}

function outForDirectoryContactSheet(out: string, entry: string): string {
  return join(out, outputPathForEntry(entry))
}

function outputPathForEntry(entry: string): string {
  const coordinate = parseEntryCoordinate(entry)
  const suffix = coordinate.exportName === "default" ? ".png" : `.${sanitizeFilePathSegment(coordinate.exportName)}.png`
  return coordinate.file.replace(/\.g\.tsx$/, suffix)
}

function parseEntryCoordinate(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

function sanitizeFilePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_")
}

async function startPreviewServer(
  serveCommand: string | undefined,
  cwd: string,
  params: { port: string; readyUrl?: string; detached?: boolean },
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
    detached: Boolean(params.detached && process.platform !== "win32"),
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
  const stop = () => {
    if (exitCode !== undefined) return
    if (!params.detached || process.platform === "win32") {
      child.kill()
      return
    }

    try {
      if (child.pid === undefined) throw new Error("Preview server pid is unavailable")
      process.kill(-child.pid, "SIGTERM")
    } catch {
      child.kill()
    }
  }
  const exitPromise = new Promise<number>((resolve) => {
    child.on("exit", (code) => {
      exitCode = code ?? 0
      resolve(exitCode)
    })
  })

  if (params.readyUrl) {
    const ready = await waitForPreviewUrl(params.readyUrl, exitPromise)
    if (ready === "ready") {
      return {
        exitCode: 0,
        stdout,
        stderr,
        stop,
      }
    }

    stop()
    return {
      exitCode: exitCode && exitCode !== 0 ? exitCode : 1,
      stdout,
      stderr:
        stderr ||
        `[adapter-configuration] preview-server-not-ready: Preview server did not make ${params.readyUrl} reachable before ${ready}.\n`,
      stop() {},
    }
  }

  await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 500))])

  return {
    exitCode: exitCode && exitCode !== 0 ? exitCode : 0,
    stdout,
    stderr,
    stop,
  }
}

async function waitForPreviewUrl(readyUrl: string, exitPromise: Promise<number>): Promise<"ready" | "exit" | "timeout"> {
  const deadline = Date.now() + DEFAULT_PREVIEW_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const result = await Promise.race([
      exitPromise.then(() => "exit" as const),
      fetch(readyUrl, { redirect: "manual", signal: AbortSignal.timeout(DEFAULT_PREVIEW_READY_REQUEST_TIMEOUT_MS) })
        .then((response) => (response.status >= 200 && response.status < 400 ? ("ready" as const) : ("retry" as const)))
        .catch(() => "retry" as const),
    ])
    if (result === "ready" || result === "exit") return result
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return "timeout"
}

export function expandUrl(template: string, params: { entry: string; frameName: string; port: string; gframes?: string[] }): string {
  const replacements: Record<string, string> = {
    entry: params.entry,
    frame: params.frameName,
    port: params.port,
    gframe: params.gframes?.map((gframe) => `&gframe=${encodeURIComponent(gframe)}`).join("") ?? "",
  }
  return template.replace(/\{([a-z]+)\}/g, (_match, key: string) => {
    if (key === "gframe") return replacements.gframe
    return encodeURIComponent(replacements[key] ?? "")
  })
}

function diagnosticsResult(diagnostics: GTSXDiagnostic[]): CLIResult {
  return {
    exitCode:
      !hasErrorDiagnostics(diagnostics) || diagnostics.some((diagnostic) => diagnostic.code.startsWith("missing-strip-script")) ? 0 : 1,
    stdout: formatDiagnostics(diagnostics),
    stderr: "",
  }
}

function formatDiagnostics(diagnostics: GTSXDiagnostic[]): string {
  if (diagnostics.length === 0) return ""
  return diagnostics.map(formatDiagnostic).join("\n") + "\n"
}

function formatDiagnostic(diagnostic: GTSXDiagnostic): string {
  const severity = diagnostic.severity === "warning" ? " warning" : ""
  return `[${diagnostic.stage}${severity}] ${diagnostic.code}: ${diagnostic.message}`
}

function hasErrorDiagnostics(diagnostics: GTSXDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity !== "warning")
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
  for (const frame of result.frames) {
    lines.push(`- ${frame.name}`)
  }
  for (const diagnostic of result.diagnostics) {
    lines.push(formatDiagnostic(diagnostic))
  }
  return `${lines.join("\n")}\n`
}

function isCLIEntrypoint(moduleUrl: string, argvPath: string | undefined): boolean {
  if (!argvPath) return false

  const modulePath = fileURLToPath(moduleUrl)
  try {
    return realpathSync(modulePath) === realpathSync(argvPath)
  } catch {
    return modulePath === resolve(argvPath)
  }
}

if (isCLIEntrypoint(import.meta.url, process.argv[1])) {
  const result = await runCLI(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: "",
    stderr: "",
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.exitCode
}
