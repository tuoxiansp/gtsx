#!/usr/bin/env node

import { realpathSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { loadRunelightConfig } from "./config.js"
import { resolveRunelightConfig, runelightDesignRootFromEntryRoot } from "./config-model.js"
import {
  resolveRunelightContractReferences,
  type RunelightEntryAnalysisResult,
  type RunelightContract,
  type RunelightDiagnostic,
} from "./contract.js"
import { buildRunelightProjectIndex } from "./project-index.js"
import { discoverRunelightProgramFiles, findNearestTSConfig } from "./project-scope.js"
import { normalizeRunelightPreviewFrameOverride } from "./preview-protocol.js"
import { runelightServeSessionPreviewUrl } from "./serve-session.js"
import { acquireRunelightServeSession, runServeSupervisor, type HostStdioMode } from "./serve-supervisor.js"

export type CLIContext = {
  captureBackend?: RunelightCaptureBackend
  cwd: string
  hostStdio?: HostStdioMode
  stdout: string
  stderr: string
  signal?: AbortSignal
  writeStderr?: (chunk: string) => void
  writeStdout?: (chunk: string) => void
}

export type RunelightCaptureOptions = {
  cwd: string
  url: string
  viewport: string
  out: string
}

export type RunelightCaptureBackend = {
  capturePreviewPage(options: RunelightCaptureOptions): Promise<void>
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
  diagnostics: RunelightDiagnostic[]
}

type EntryResolution = {
  entries: string[]
  diagnostics: RunelightDiagnostic[]
}

type ContractResolution = {
  contracts: RunelightContract[]
  diagnostics: RunelightDiagnostic[]
}

const HELP = `runelight

Usage:
  runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir] [--json]
  runelight serve [-p <tsconfig-or-dir>] [--port <port>]
  runelight capture [-p <tsconfig-or-dir>] <entry[#export]|dir> [--frame <name>] [--frame-override <entry#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
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

  if (args[0] === "check") {
    const commandArgs = parseCommandArguments(args, {
      booleanOptions: ["--json"],
      maxPositionals: 1,
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const contractResolution = await resolveCLIContracts(cwd)
    if (contractResolution.diagnostics.length > 0) return diagnosticsResult(contractResolution.diagnostics)
    const contracts = contractResolution.contracts
    const entry = commandArgs.positionals[0]

    if (!entry) {
      const config = loadRunelightConfig(cwd)
      if (!config.config) return diagnosticsResult(config.diagnostics)
      const resolvedConfig = resolveRunelightConfig(config.config)

      return checkResolvedEntries(
        cwd,
        discoverConfiguredRunelightProjectEntryCoordinates(cwd, resolvedConfig.project.sourceRoot, resolvedConfig.project.entryRoot, projectSelection.tsconfigPath, contracts),
        {
          aggregateJson: true,
          contracts,
          fallbackFile: "configured Runelight project",
          json: args.includes("--json"),
          stderr: context.stderr,
        },
      )
    }

    if (isDirectory(cwd, entry)) {
      return checkResolvedEntries(cwd, discoverRunelightEntryCoordinates(cwd, entry, projectSelection.tsconfigPath, contracts), {
        aggregateJson: true,
        contracts,
        fallbackFile: entry,
        json: args.includes("--json"),
        stderr: context.stderr,
      })
    }

    if (projectSelection.tsconfigPath && !isEntryInRunelightScope(cwd, entry, projectSelection.tsconfigPath, contracts)) {
      return entryOutsideProjectScopeResult(entry)
    }

    return checkResolvedEntries(cwd, resolveRunelightEntryCoordinates(cwd, entry, projectSelection.tsconfigPath, contracts), {
      contracts,
      fallbackFile: entry,
      json: args.includes("--json"),
      stderr: context.stderr,
    })
  }

  if (args[0] === "serve") {
    const commandArgs = parseCommandArguments(args, {
      maxPositionals: 0,
      valueOptions: ["--port"],
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const portOption = resolvePortOption(args)
    if (portOption.diagnostic) return diagnosticsResult([portOption.diagnostic])

    const config = loadRunelightConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)
    if (!config.config.host?.command) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "missing-host-command",
          message: "Add host.command to runelight.config.ts so runelight serve can wrap the project's Host.",
        },
      ])
    }

    return runServeSupervisor(config.config.host.command, cwd, {
      hostStdio: context.hostStdio,
      port: portOption.port,
      signal: context.signal,
      stderr: context.stderr,
      writeStderr: context.writeStderr,
      writeStdout: context.writeStdout,
    })
  }

  if (args[0] === "capture") {
    if (args.includes("--all")) {
      return diagnosticsResult([
        {
          stage: "browser-capture",
          severity: "error",
          code: "unsupported-capture-all-option",
          message: "Omit --frame to capture all frames; --all is no longer a Runelight capture option.",
        },
      ])
    }

    const commandArgs = parseCommandArguments(args, {
      maxPositionals: 1,
      valueOptions: ["--frame", "--frame-override", "--out", "--port", "--viewport"],
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const entry = commandArgs.positionals[0]
    if (!entry) {
      return diagnosticsStderrResult(context.stdout, [
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "missing-capture-entry",
          message: "Pass an entry file or directory to runelight capture.",
        },
      ])
    }
    const portOption = resolvePortOption(args)
    if (portOption.diagnostic) return diagnosticsResult([portOption.diagnostic])

    const contractResolution = await resolveCLIContracts(cwd)
    if (contractResolution.diagnostics.length > 0) return diagnosticsResult(contractResolution.diagnostics)
    const contracts = contractResolution.contracts

    if (isDirectory(cwd, entry)) {
      const resolvedEntries = discoverRunelightEntryCoordinates(cwd, entry, projectSelection.tsconfigPath, contracts)
      if (resolvedEntries.entries.length === 0) {
        return diagnosticsResult(nonEmptyDiagnostics(resolvedEntries.diagnostics, entry, contracts))
      }

      const checks = resolvedEntries.entries.map((candidate) => analyzeEntryWithContracts(contracts, cwd, candidate))
      if (hasErrorDiagnostics(resolvedEntries.diagnostics) || checks.some((check) => hasErrorDiagnostics(check.diagnostics))) {
        return {
          exitCode: 1,
          stdout: [checks.map(formatCheckResult).join("\n"), formatDiagnostics(resolvedEntries.diagnostics)].join(""),
          stderr: context.stderr,
        }
      }

      const config = loadRunelightConfig(cwd)
      if (!config.config) return diagnosticsResult(config.diagnostics)

      const out = readOption(args, "--out") ?? "runelight-captures"
      if (out.endsWith(".png")) {
        return diagnosticsResult([
          {
            stage: "browser-capture",
            severity: "error",
            code: "directory-output-must-be-directory",
            message: "Directory capture writes one PNG per entry, so --out must be a directory.",
          },
        ])
      }

      const viewport = readOption(args, "--viewport") ?? "1440x900"
      const viewportDiagnostic = validateCaptureViewport(viewport)
      if (viewportDiagnostic) return diagnosticsResult([viewportDiagnostic])
      const frameOverrides = readOptions(args, "--frame-override")
      const captureBackend = context.captureBackend
      if (!captureBackend) return missingCaptureBackendResult()
      const serveSession = await acquireRunelightServeSession(cwd, config.config.host?.command, {
        port: portOption.port,
        stderr: context.stderr,
      })
      if (serveSession.exitCode !== 0 || !serveSession.baseUrl) return serveSession

      try {
        const outputs: string[] = []
        for (const candidate of resolvedEntries.entries) {
          const outPath = outForDirectoryContactSheet(out, candidate)
          await captureBackend.capturePreviewPage({
            cwd,
            url: runelightServeSessionPreviewUrl(serveSession.baseUrl, {
              all: true,
              entry: candidate,
              frameOverrides,
            }),
            viewport,
            out: outPath,
          })
          outputs.push(`Captured ${candidate} contact sheet to ${outPath}\n`)
        }
        return { exitCode: 0, stdout: `${serveSession.stdout}${outputs.join("")}`, stderr: context.stderr }
      } catch (error) {
        return diagnosticsResult([
          {
            stage: "browser-capture",
            severity: "error",
            code: "browser-capture-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        ])
      } finally {
        serveSession.stop()
      }
    }

    if (projectSelection.tsconfigPath && !isEntryInRunelightScope(cwd, entry, projectSelection.tsconfigPath, contracts)) {
      return entryOutsideProjectScopeResult(entry)
    }

    const resolvedEntry = resolveRunelightEntryCoordinates(cwd, entry, projectSelection.tsconfigPath, contracts)
    if (resolvedEntry.entries.length === 0) {
      return diagnosticsResult(nonEmptyDiagnostics(resolvedEntry.diagnostics, entry, contracts))
    }
    if (resolvedEntry.entries.length > 1) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          severity: "error",
          code: "ambiguous-entry-coordinate",
          message: `${entry} contains multiple Runelight component exports; pass one explicit coordinate such as ${resolvedEntry.entries[0]}.`,
          file: entry,
        },
      ])
    }

    const selectedEntry = resolvedEntry.entries[0] ?? entry
    const check = analyzeEntryWithContracts(contracts, cwd, selectedEntry)
    if (hasErrorDiagnostics(check.diagnostics)) {
      return { exitCode: 1, stdout: formatCheckResult(check), stderr: context.stderr }
    }

    const config = loadRunelightConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)

    const viewport = readOption(args, "--viewport") ?? "1440x900"
    const viewportDiagnostic = validateCaptureViewport(viewport)
    if (viewportDiagnostic) return diagnosticsResult([viewportDiagnostic])
    const selectedFrame = readOption(args, "--frame")
    const captureAllFrames = selectedFrame === undefined
    const out = readOption(args, "--out") ?? (captureAllFrames ? "runelight-captures" : "runelight-capture.png")
    const frameOverrides = readOptions(args, "--frame-override")

    if (selectedFrame !== undefined && !check.frames.some((frame) => frame.name === selectedFrame)) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          severity: "error",
          code: "missing-frame",
          message: `No frame named ${selectedFrame} found for ${entry}.`,
          file: entry,
        },
      ])
    }

    const captureBackend = context.captureBackend
    if (!captureBackend) return missingCaptureBackendResult()

    const serveSession = await acquireRunelightServeSession(cwd, config.config.host?.command, {
      port: portOption.port,
      stderr: context.stderr,
    })
    if (serveSession.exitCode !== 0 || !serveSession.baseUrl) return serveSession
    const captureUrl = runelightServeSessionPreviewUrl(serveSession.baseUrl, {
      all: captureAllFrames,
      entry: selectedEntry,
      frameName: selectedFrame ?? "",
      frameOverrides,
    })

    try {
      if (captureAllFrames) {
        const outPath = outForEntryContactSheet(out, selectedEntry)
        await captureBackend.capturePreviewPage({
          cwd,
          url: captureUrl,
          viewport,
          out: outPath,
        })
        return { exitCode: 0, stdout: `${serveSession.stdout}Captured ${selectedEntry} contact sheet to ${outPath}\n`, stderr: context.stderr }
      }

      await captureBackend.capturePreviewPage({
        cwd,
        url: captureUrl,
        viewport,
        out,
      })
      return { exitCode: 0, stdout: `${serveSession.stdout}Captured ${selectedFrame} to ${out}\n`, stderr: context.stderr }
    } catch (error) {
      return diagnosticsResult([
        {
          stage: "browser-capture",
          severity: "error",
          code: "browser-capture-failed",
          message: error instanceof Error ? error.message : String(error),
        },
      ])
    } finally {
      serveSession.stop()
    }
  }

  return diagnosticsStderrResult(context.stdout, [
    {
      stage: "adapter-configuration",
      severity: "error",
      code: "unknown-command",
      message: `Unknown command ${args[0] ?? ""}.`,
    },
  ])
}

function missingCaptureBackendResult(): CLIResult {
  return diagnosticsResult([
    {
      stage: "browser-capture",
      severity: "error",
      code: "missing-capture-backend",
      message: "Provide a capture backend when calling runCLI capture programmatically. The @runelight/cli binary injects the Playwright backend by default.",
    },
  ])
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
          severity: "error",
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
          severity: "error",
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
  const config = loadRunelightConfig(cwd)
  if (!config.config?.project?.tsconfig) return undefined

  const tsconfigPath = resolve(cwd, config.config.project.tsconfig)
  return statOrUndefined(tsconfigPath)?.isFile() ? tsconfigPath : undefined
}

async function resolveCLIContracts(cwd: string): Promise<ContractResolution> {
  const config = loadRunelightConfig(cwd)
  if (!config.config) return { contracts: [], diagnostics: config.diagnostics }

  try {
    const contracts = await resolveRunelightContractReferences(config.config.contracts, { cwd })
    if (contracts.length === 0) {
      return {
        contracts,
        diagnostics: [
          {
            stage: "adapter-configuration",
            severity: "error",
            code: "missing-contracts",
            message: 'Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].',
          },
        ],
      }
    }
    return { contracts, diagnostics: [] }
  } catch (error) {
    return {
      contracts: [],
      diagnostics: [
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "invalid-contracts",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
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

function resolveRunelightEntryCoordinates(
  cwd: string,
  entry: string,
  tsconfigPath: string | undefined,
  contracts: readonly RunelightContract[],
): EntryResolution {
  if (hasExplicitExportCoordinate(entry)) {
    return { entries: [entry], diagnostics: [] }
  }

  return discoverRunelightFileEntryCoordinates(cwd, entry, tsconfigPath, contracts)
}

function discoverRunelightEntryCoordinates(
  cwd: string,
  targetDirectory: string,
  tsconfigPath: string | undefined,
  contracts: readonly RunelightContract[],
): EntryResolution {
  const index = buildRunelightProjectIndex({ contracts, cwd, sourceRoot: targetDirectory, tsconfigPath })
  return {
    entries: index.files.flatMap((file) => file.components.map((component) => component.coordinate)),
    diagnostics: index.files.filter((file) => file.components.length === 0).flatMap((file) => file.diagnostics),
  }
}

function discoverConfiguredRunelightProjectEntryCoordinates(
  cwd: string,
  sourceRoot: string,
  entryRoot: string,
  tsconfigPath: string | undefined,
  contracts: readonly RunelightContract[],
): EntryResolution {
  const index = buildRunelightProjectIndex({
    additionalSourceRoots: [runelightDesignRootFromEntryRoot(entryRoot)],
    contracts,
    cwd,
    sourceRoot,
    tsconfigPath,
  })
  return {
    entries: index.files.flatMap((file) => file.components.map((component) => component.coordinate)),
    diagnostics: index.files.filter((file) => file.components.length === 0).flatMap((file) => file.diagnostics),
  }
}

function discoverRunelightFileEntryCoordinates(
  cwd: string,
  entry: string,
  tsconfigPath: string | undefined,
  contracts: readonly RunelightContract[],
): EntryResolution {
  const file = normalizeProjectPath(entryFile(entry))
  const sourceRoot = dirname(file)
  const index = buildRunelightProjectIndex({
    contracts,
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
          severity: "error",
          code: "entry-not-found",
          message: `Runelight entry does not exist: ${entry}.`,
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

function isEntryInRunelightScope(cwd: string, entry: string, tsconfigPath: string, contracts: readonly RunelightContract[]): boolean {
  const file = normalizeProjectPath(entryFile(entry))
  const contract = contracts.find((candidate) => candidate.isEntryFile(file))
  if (!contract) return false

  const programFiles = discoverRunelightProgramFiles({ cwd, root: ".", tsconfigPath })
  if (programFiles.includes(file)) return true
  return !contract.isTypeScriptProgramFile?.(file) && Boolean(statOrUndefined(resolve(cwd, file))?.isFile())
}

function entryFile(entry: string): string {
  return entry.split("#", 1)[0] ?? entry
}

function entryOutsideProjectScopeResult(entry: string): CLIResult {
  return diagnosticsResult([
    {
      stage: "typescript",
      severity: "error",
      code: "entry-outside-project-scope",
      message: `${entryFile(entry)} is not in the selected TypeScript project scope.`,
      file: entryFile(entry),
    },
  ])
}

function analyzeEntryWithContracts(contracts: readonly RunelightContract[], cwd: string, entry: string): RunelightEntryAnalysisResult {
  const filePath = normalizeProjectPath(entryFile(entry))
  const contract = contracts.find((candidate) => candidate.isEntryFile(filePath))
  if (contract) return contract.analyzeEntry({ cwd, entry })

  return {
    entry,
    mode: "unknown",
    defaultExport: false,
    frames: [],
    providers: {},
    diagnostics: [
      {
        stage: "contract-extraction",
        severity: "error",
        code: "missing-entry-contract",
        message: `No Runelight contract is configured for ${filePath}.`,
        file: filePath,
      },
    ],
  }
}

function checkResolvedEntries(
  cwd: string,
  resolution: EntryResolution,
  options: { aggregateJson?: boolean; contracts: readonly RunelightContract[]; fallbackFile: string; json: boolean; stderr: string },
): CLIResult {
  if (resolution.entries.length === 0) {
    const diagnostics = nonEmptyDiagnostics(resolution.diagnostics, options.fallbackFile, options.contracts)
    if (options.json && options.aggregateJson) {
      return {
        exitCode: hasErrorDiagnostics(diagnostics) ? 1 : 0,
        stdout: `${JSON.stringify({ entries: [], diagnostics }, null, 2)}\n`,
        stderr: options.stderr,
      }
    }

    return diagnosticsResult(diagnostics)
  }

  const results = resolution.entries.map((candidate) => analyzeEntryWithContracts(options.contracts, cwd, candidate))
  const diagnostics = [...resolution.diagnostics, ...results.flatMap((result) => result.diagnostics)]
  const hasErrors = hasErrorDiagnostics(diagnostics)
  if (options.json) {
    const stdout =
      !options.aggregateJson && results.length === 1 && resolution.diagnostics.length === 0
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

function nonEmptyDiagnostics(
  diagnostics: RunelightDiagnostic[],
  target: string,
  contracts: readonly RunelightContract[],
): RunelightDiagnostic[] {
  if (diagnostics.length > 0) return diagnostics

  const contractList = contracts.length > 0 ? ` Loaded contracts: ${contracts.map((contract) => contract.id).join(", ")}.` : ""
  return [
    {
      stage: "contract-extraction",
      severity: "error",
      code: "no-entries-found",
      message: `No Runelight entries found under ${target}.${contractList}`,
      file: target,
    },
  ]
}

function parseCommandArguments(
  args: string[],
  options: { booleanOptions?: readonly string[]; maxPositionals: number; valueOptions?: readonly string[] },
): { diagnostics: RunelightDiagnostic[]; positionals: string[] } {
  const booleanOptions = new Set(options.booleanOptions ?? [])
  const valueOptions = new Set(options.valueOptions ?? [])
  const diagnostics: RunelightDiagnostic[] = []
  const positionals: string[] = []

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index] ?? ""

    if (isOptionToken(arg)) {
      if (booleanOptions.has(arg)) continue
      if (valueOptions.has(arg)) {
        const value = args[index + 1]
        if (value === undefined || isOptionToken(value)) {
          diagnostics.push(missingOptionValueDiagnostic(arg))
          continue
        }
        index += 1
        continue
      }

      diagnostics.push({
        stage: "adapter-configuration",
        severity: "error",
        code: "unknown-option",
        message: `Unknown option ${arg}.`,
      })
      continue
    }

    positionals.push(arg)
  }

  for (const argument of positionals.slice(options.maxPositionals)) {
    diagnostics.push({
      stage: "adapter-configuration",
      severity: "error",
      code: "unexpected-argument",
      message: `Unexpected argument ${argument}.`,
    })
  }

  return {
    diagnostics,
    positionals: positionals.slice(0, options.maxPositionals),
  }
}

function missingOptionValueDiagnostic(optionName: string): RunelightDiagnostic {
  return {
    stage: "adapter-configuration",
    severity: "error",
    code: "missing-option-value",
    message: `Missing value for ${optionName}.`,
  }
}

function isOptionToken(value: string): boolean {
  return value === "--" || /^-{1,2}[A-Za-z]/.test(value)
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

function resolvePortOption(args: string[]): { diagnostic?: RunelightDiagnostic; port?: string } {
  if (!args.includes("--port")) return {}

  const port = readOption(args, "--port")
  if (isValidPort(port)) return { port }

  return {
    diagnostic: {
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-port",
      message: `Invalid port ${port ?? "<missing>"}. Use a TCP port from 1 to 65535.`,
    },
  }
}

function isValidPort(port: string | undefined): port is string {
  if (!port || !/^[1-9]\d*$/.test(port)) return false

  const value = Number(port)
  return Number.isSafeInteger(value) && value >= 1 && value <= 65_535
}

function validateCaptureViewport(viewport: string): RunelightDiagnostic | undefined {
  const match = /^([1-9]\d*)x([1-9]\d*)$/.exec(viewport)
  if (match) return undefined

  return {
    stage: "browser-capture",
    severity: "error",
    code: "invalid-viewport",
    message: `Invalid viewport ${viewport}. Use WIDTHxHEIGHT, for example 1440x900.`,
  }
}

function outForEntryContactSheet(out: string, entry: string): string {
  if (out.endsWith(".png")) return out

  const fileName = outputPathForEntry(entry).split(/[\\/]/).pop() ?? "runelight-capture.png"
  return join(out, fileName)
}

function outForDirectoryContactSheet(out: string, entry: string): string {
  return join(out, outputPathForEntry(entry))
}

function outputPathForEntry(entry: string): string {
  const coordinate = parseEntryCoordinate(entry)
  const suffix = coordinate.exportName === "default" ? ".png" : `.${sanitizeFilePathSegment(coordinate.exportName)}.png`
  return coordinate.file.replace(/\.g\.[^/.]+$/, suffix)
}

function parseEntryCoordinate(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

function sanitizeFilePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_")
}

export function expandUrl(template: string, params: { entry: string; frameName: string; port: string; frameOverrides?: string[] }): string {
  const replacements: Record<string, string> = {
    entry: params.entry,
    frame: params.frameName,
    port: params.port,
    frameOverrides: params.frameOverrides?.map((frameOverride) => `&frameOverride=${encodeURIComponent(normalizeRunelightPreviewFrameOverride(frameOverride))}`).join("") ?? "",
  }
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, key: string) => {
    if (key === "frameOverrides") return replacements.frameOverrides
    return encodeURIComponent(replacements[key] ?? "")
  })
}

function diagnosticsResult(diagnostics: RunelightDiagnostic[]): CLIResult {
  return {
    exitCode: hasErrorDiagnostics(diagnostics) ? 1 : 0,
    stdout: formatDiagnostics(diagnostics),
    stderr: "",
  }
}

function diagnosticsStderrResult(stdout: string, diagnostics: RunelightDiagnostic[]): CLIResult {
  return {
    exitCode: hasErrorDiagnostics(diagnostics) ? 1 : 0,
    stdout,
    stderr: formatDiagnostics(diagnostics),
  }
}

function formatDiagnostics(diagnostics: RunelightDiagnostic[]): string {
  if (diagnostics.length === 0) return ""
  return diagnostics.map(formatDiagnostic).join("\n") + "\n"
}

function formatDiagnostic(diagnostic: RunelightDiagnostic): string {
  const severity = diagnostic.severity === "warning" ? " warning" : ""
  return `[${diagnostic.stage}${severity}] ${diagnostic.code}: ${diagnostic.message}`
}

function hasErrorDiagnostics(diagnostics: RunelightDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity !== "warning")
}

function formatCheckResult(result: RunelightEntryAnalysisResult): string {
  const lines = [`Runelight ${result.mode} entry: ${result.entry}`]
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
  const abortController = new AbortController()
  process.once("SIGINT", () => abortController.abort())
  process.once("SIGTERM", () => abortController.abort())

  const result = await runCLI(process.argv.slice(2), {
    cwd: process.cwd(),
    hostStdio: "inherit",
    signal: abortController.signal,
    stdout: "",
    stderr: "",
    writeStderr: (chunk) => process.stderr.write(chunk),
    writeStdout: (chunk) => process.stdout.write(chunk),
  })
  if (result.stdout && !abortController.signal.aborted) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.exitCode
}
