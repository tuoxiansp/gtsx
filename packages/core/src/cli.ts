#!/usr/bin/env node

import { realpathSync, statSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import {
  createRunelightWorkspaceChangesReportFromGit,
  type RunelightWorkspaceChangesReport,
} from "@runelight/changes"

import { loadRunelightConfig } from "./config.js"
import {
  resolveRunelightConfig,
  runelightBaselineRootFromEntryRoot,
  runelightDesignRootFromEntryRoot,
} from "./config-model.js"
import {
  resolveRunelightContractReferences,
  type RunelightEntryAnalysisResult,
  type RunelightContract,
  type RunelightDiagnostic,
} from "./contract.js"
import {
  pruneInspectFrameDependencies,
  type RunelightInspectPrunedDependency,
} from "./inspect-pruning.js"
import {
  buildRunelightProjectIndex,
  type RunelightProjectIndex,
  type RunelightProjectIndexComponent,
} from "./project-index.js"
import { discoverRunelightProgramFiles, findNearestTSConfig } from "./project-scope.js"
import {
  encodeRunelightPreviewFrameOverride,
  normalizeRunelightPreviewFrameOverride,
} from "./preview-protocol.js"
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

type RunelightInspectFrame = {
  description: string
  name: string
  kind: "pure" | "scope"
  providerVariants?: Record<string, string | string[]>
  providers?: string[]
  dependencies: string[]
  prunedDependencies?: RunelightInspectPrunedDependency[]
  structuralDependencies: string[]
}

type RunelightInspectNode = {
  coordinate: string
  filePath: string
  exportName: string
  componentName: string
  mode: "pure" | "scope" | "unknown"
  dependencies: string[]
  frames: RunelightInspectFrame[]
  structuralDependencies: string[]
  diagnostics: RunelightDiagnostic[]
}

type RunelightInspectReport = {
  schemaVersion: 1
  root: string
  nodes: RunelightInspectNode[]
  diagnostics: RunelightDiagnostic[]
}

type RunelightPreviewTargetsWalkOrder = "breadth-first" | "depth-first"

type RunelightPreviewTargetsPathNode = {
  coordinate: string
  frame: string
  description: string
  cycle?: true
  cyclePath?: string[]
}

type RunelightPreviewTarget = {
  path: string
  paths: RunelightPreviewTargetsPathNode[][]
}

type RunelightPreviewTargetsReport = {
  schemaVersion: 1
  page: {
    offset: number
    limit: number
    currentPageSize: number
    nextOffset: number | null
    hasMore: boolean
  }
  traversal: {
    order: RunelightPreviewTargetsWalkOrder
    maxDepth: number | null
    maxTargets: number
    generatedTargets: number
    truncated: boolean
  }
  targets: RunelightPreviewTarget[]
  diagnostics: RunelightDiagnostic[]
}

const DEFAULT_PREVIEW_TARGETS_PAGE_LIMIT = 20

const HELP = `runelight

Usage:
  runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir] [--json]
  runelight inspect [-p <tsconfig-or-dir>] <entry[#export]> [--json]
  runelight preview-targets [-p <tsconfig-or-dir>] <entry[#export]> [--json] [--walk breadth-first|depth-first] [--max-depth <n>] [--max-targets <n>] [--limit <n>] [--offset <n>]
  runelight changes [-p <tsconfig-or-dir>] [--json] [--ui-only] [--component <component-or-file>]
  runelight serve [-p <tsconfig-or-dir>] [--port <port>]
  runelight capture [-p <tsconfig-or-dir>] <entry[#export]|dir> [--frame <name>] [--frame-override <entry#export:frame>] [--viewport 1440x900] [--out <file.png|dir>] [--port <port>]
  runelight capture [-p <tsconfig-or-dir>] --path </runelight?...> [--viewport 1440x900] [--out <file.png>] [--port <port>]
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

  if (args[0] === "inspect") {
    const commandArgs = parseCommandArguments(args, {
      booleanOptions: ["--json"],
      maxPositionals: 1,
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const entry = commandArgs.positionals[0]
    if (!entry) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "missing-inspect-entry",
          message: "Pass an entry file or coordinate to runelight inspect.",
        },
      ])
    }

    const config = loadRunelightConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)
    const resolvedConfig = resolveRunelightConfig(config.config)
    const contractResolution = await resolveCLIContracts(cwd)
    if (contractResolution.diagnostics.length > 0) return diagnosticsResult(contractResolution.diagnostics)

    if (projectSelection.tsconfigPath && !isEntryInRunelightScope(cwd, entry, projectSelection.tsconfigPath, contractResolution.contracts)) {
      return entryOutsideProjectScopeResult(entry)
    }

    const index = buildRunelightProjectIndex({
      additionalSourceRoots: [runelightDesignRootFromEntryRoot(resolvedConfig.project.entryRoot)],
      contracts: contractResolution.contracts,
      cwd,
      sourceRoot: resolvedConfig.project.sourceRoot,
      tsconfigPath: resolvedConfig.project.tsconfig ?? projectSelection.tsconfigPath,
    })
    const rootResolution = resolveInspectRootComponent(index, entry)
    if (rootResolution.diagnostics.length > 0) return diagnosticsResult(rootResolution.diagnostics)
    if (!rootResolution.component) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          severity: "error",
          code: "inspect-root-unresolved",
          message: `Runelight inspect could not resolve ${entry}.`,
          file: entryFile(entry),
        },
      ])
    }

    const report = createRunelightInspectReport(cwd, index, rootResolution.component)
    return {
      exitCode: hasErrorDiagnostics(report.diagnostics) ? 1 : 0,
      stdout: args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : formatRunelightInspectReport(report),
      stderr: context.stderr,
    }
  }

  if (args[0] === "preview-targets") {
    const commandArgs = parseCommandArguments(args, {
      booleanOptions: ["--json"],
      maxPositionals: 1,
      valueOptions: ["--limit", "--max-depth", "--max-targets", "--offset", "--walk"],
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const entry = commandArgs.positionals[0]
    if (!entry) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "missing-preview-targets-entry",
          message: "Pass an entry file or coordinate to runelight preview-targets.",
        },
      ])
    }

    const walk = readOption(args, "--walk") ?? "breadth-first"
    if (!isRunelightPreviewTargetsWalkOrder(walk)) {
      return diagnosticsResult([
        {
          stage: "adapter-configuration",
          severity: "error",
          code: "invalid-preview-targets-walk",
          message: `Invalid preview-targets walk order ${walk}. Use breadth-first or depth-first.`,
        },
      ])
    }
    const maxDepthResult = readOptionalNonNegativeIntegerOption(args, "--max-depth")
    if (maxDepthResult.diagnostic) return diagnosticsResult([maxDepthResult.diagnostic])
    const maxTargetsResult = readPositiveIntegerOption(args, "--max-targets", 1000)
    if (maxTargetsResult.diagnostic) return diagnosticsResult([maxTargetsResult.diagnostic])
    const limitResult = readPositiveIntegerOption(args, "--limit", DEFAULT_PREVIEW_TARGETS_PAGE_LIMIT)
    if (limitResult.diagnostic) return diagnosticsResult([limitResult.diagnostic])
    const offsetResult = readNonNegativeIntegerOption(args, "--offset", 0)
    if (offsetResult.diagnostic) return diagnosticsResult([offsetResult.diagnostic])

    const config = loadRunelightConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)
    const resolvedConfig = resolveRunelightConfig(config.config)
    const contractResolution = await resolveCLIContracts(cwd)
    if (contractResolution.diagnostics.length > 0) return diagnosticsResult(contractResolution.diagnostics)

    if (projectSelection.tsconfigPath && !isEntryInRunelightScope(cwd, entry, projectSelection.tsconfigPath, contractResolution.contracts)) {
      return entryOutsideProjectScopeResult(entry)
    }

    const index = buildRunelightProjectIndex({
      additionalSourceRoots: [runelightDesignRootFromEntryRoot(resolvedConfig.project.entryRoot)],
      contracts: contractResolution.contracts,
      cwd,
      sourceRoot: resolvedConfig.project.sourceRoot,
      tsconfigPath: resolvedConfig.project.tsconfig ?? projectSelection.tsconfigPath,
    })
    const rootResolution = resolveInspectRootComponent(index, entry)
    if (rootResolution.diagnostics.length > 0) return diagnosticsResult(rootResolution.diagnostics)
    if (!rootResolution.component) {
      return diagnosticsResult([
        {
          stage: "contract-extraction",
          severity: "error",
          code: "preview-targets-root-unresolved",
          message: `Runelight preview-targets could not resolve ${entry}.`,
          file: entryFile(entry),
        },
      ])
    }

    const inspectReport = createRunelightInspectReport(cwd, index, rootResolution.component)
    const report = createRunelightPreviewTargetsReport(inspectReport, {
      limit: limitResult.value,
      maxDepth: maxDepthResult.value,
      maxTargets: maxTargetsResult.value,
      offset: offsetResult.value,
      order: walk,
    })
    return {
      exitCode: hasErrorDiagnostics(report.diagnostics) ? 1 : 0,
      stdout: args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : formatRunelightPreviewTargetsReport(report),
      stderr: context.stderr,
    }
  }

  if (args[0] === "changes") {
    const commandArgs = parseCommandArguments(args, {
      booleanOptions: ["--json", "--ui-only"],
      maxPositionals: 0,
      valueOptions: ["--component"],
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const config = loadRunelightConfig(cwd)
    if (!config.config) return diagnosticsResult(config.diagnostics)
    const resolvedConfig = resolveRunelightConfig(config.config)
    const contractResolution = await resolveCLIContracts(cwd)
    if (contractResolution.diagnostics.length > 0) return diagnosticsResult(contractResolution.diagnostics)

    const report = createCLIWorkspaceChangesReport({
      contracts: contractResolution.contracts,
      contractReferences: config.config.contracts,
      cwd,
      entryRoot: resolvedConfig.project.entryRoot,
      sourceRoot: resolvedConfig.project.sourceRoot,
      tsconfigPath: resolvedConfig.project.tsconfig ?? projectSelection.tsconfigPath,
    })
    const filteredReport = filterCLIWorkspaceChangesReport(report, {
      component: readOption(args, "--component"),
      uiOnly: args.includes("--ui-only"),
    })
    const hasErrors = filteredReport.diagnostics.some((diagnostic) => diagnostic.severity === "error")

    return {
      exitCode: hasErrors ? 1 : 0,
      stdout: args.includes("--json")
        ? `${JSON.stringify(filteredReport, null, 2)}\n`
        : formatCLIWorkspaceChangesReport(filteredReport),
      stderr: context.stderr,
    }
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
      valueOptions: ["--frame", "--frame-override", "--out", "--path", "--port", "--viewport"],
    })
    if (commandArgs.diagnostics.length > 0) return diagnosticsResult(commandArgs.diagnostics)

    const entry = commandArgs.positionals[0]
    const previewPath = readOption(args, "--path")
    if (previewPath !== undefined) {
      const pathCaptureDiagnostic = validatePreviewPathCaptureArguments(args, entry, previewPath)
      if (pathCaptureDiagnostic) return diagnosticsResult([pathCaptureDiagnostic])

      const portOption = resolvePortOption(args)
      if (portOption.diagnostic) return diagnosticsResult([portOption.diagnostic])

      const viewport = readOption(args, "--viewport") ?? "1440x900"
      const viewportDiagnostic = validateCaptureViewport(viewport)
      if (viewportDiagnostic) return diagnosticsResult([viewportDiagnostic])
      const out = readOption(args, "--out") ?? "runelight-capture.png"
      const outDiagnostic = validatePreviewPathCaptureOutput(out)
      if (outDiagnostic) return diagnosticsResult([outDiagnostic])

      const captureBackend = context.captureBackend
      if (!captureBackend) return missingCaptureBackendResult()

      const config = loadRunelightConfig(cwd)
      if (!config.config) return diagnosticsResult(config.diagnostics)

      const serveSession = await acquireRunelightServeSession(cwd, config.config.host?.command, {
        port: portOption.port,
        stderr: context.stderr,
      })
      if (serveSession.exitCode !== 0 || !serveSession.baseUrl) return serveSession

      const captureUrl = runelightPreviewPathCaptureUrl(serveSession.baseUrl, previewPath)
      try {
        await captureBackend.capturePreviewPage({
          cwd,
          url: captureUrl,
          viewport,
          out,
        })
        return { exitCode: 0, stdout: `${serveSession.stdout}Captured ${previewPath} to ${out}\n`, stderr: context.stderr }
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

      const outPath = outForSingleFrame(out, selectedEntry, selectedFrame)
      await captureBackend.capturePreviewPage({
        cwd,
        url: captureUrl,
        viewport,
        out: outPath,
      })
      return { exitCode: 0, stdout: `${serveSession.stdout}Captured ${selectedFrame} to ${outPath}\n`, stderr: context.stderr }
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

function resolveInspectRootComponent(
  index: RunelightProjectIndex,
  entry: string,
): { component: RunelightProjectIndexComponent; diagnostics: [] } | { component?: undefined; diagnostics: RunelightDiagnostic[] } {
  if (hasExplicitExportCoordinate(entry)) {
    const coordinate = normalizeEntryCoordinate(entry)
    const component = index.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === coordinate)
    if (component) return { component, diagnostics: [] }

    return {
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
          code: "entry-not-found",
          message: `Runelight entry does not exist: ${entry}.`,
          file: entryFile(entry),
        },
      ],
    }
  }

  const filePath = normalizeProjectPath(entryFile(entry))
  const file = index.files.find((candidate) => candidate.path === filePath)
  if (!file) {
    return {
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
  if (file.components.length > 1) {
    return {
      diagnostics: [
        {
          stage: "contract-extraction",
          severity: "error",
          code: "ambiguous-entry-coordinate",
          message: `${entry} contains multiple Runelight component exports; pass one explicit coordinate such as ${file.components[0]?.coordinate}.`,
          file: entry,
        },
      ],
    }
  }
  const component = file.components[0]
  if (component) return { component, diagnostics: [] }

  return {
    diagnostics: file.diagnostics.length > 0
      ? file.diagnostics
      : [
          {
            stage: "contract-extraction",
            severity: "error",
            code: "no-entries-found",
            message: `No Runelight entries found in ${entry}.`,
            file: entry,
          },
        ],
  }
}

function createRunelightInspectReport(cwd: string, index: RunelightProjectIndex, root: RunelightProjectIndexComponent): RunelightInspectReport {
  const componentsByCoordinate = new Map(index.files.flatMap((file) => file.components.map((component) => [component.coordinate, component] as const)))
  const visited = new Set<string>()
  const queue: RunelightProjectIndexComponent[] = [root]
  const nodes: RunelightInspectNode[] = []

  while (queue.length > 0) {
    const component = queue.shift()
    if (!component || visited.has(component.coordinate)) continue
    visited.add(component.coordinate)
    nodes.push(toRunelightInspectNode(cwd, component, index))

    for (const dependency of inspectComponentStructuralDependencies(component)) {
      const dependencyComponent = componentsByCoordinate.get(dependency)
      if (dependencyComponent && !visited.has(dependencyComponent.coordinate)) {
        queue.push(dependencyComponent)
      }
    }
  }

  return {
    schemaVersion: 1,
    root: root.coordinate,
    nodes,
    diagnostics: nodes.flatMap((node) => node.diagnostics),
  }
}

function toRunelightInspectNode(
  cwd: string,
  component: RunelightProjectIndexComponent,
  index: RunelightProjectIndex,
): RunelightInspectNode {
  const frames = component.frames.map((frame) => {
    const structuralDependencies = inspectFrameStructuralDependencies(component, frame.name)
    const dependencyResult = pruneInspectFrameDependencies({
      component,
      cwd,
      frameName: frame.name,
      index,
      structuralDependencies,
    })

    return {
      description: frame.description,
      name: frame.name,
      kind: frame.kind,
      ...(frame.providerVariants ? { providerVariants: frame.providerVariants } : {}),
      ...(frame.providers ? { providers: frame.providers } : {}),
      dependencies: dependencyResult.dependencies,
      ...(dependencyResult.prunedDependencies.length > 0 ? { prunedDependencies: dependencyResult.prunedDependencies } : {}),
      structuralDependencies: dependencyResult.structuralDependencies,
    }
  })

  return {
    coordinate: component.coordinate,
    filePath: component.filePath,
    exportName: component.exportName,
    componentName: component.componentName,
    mode: component.mode,
    dependencies: uniqueSorted(frames.flatMap((frame) => frame.dependencies)),
    frames,
    structuralDependencies: inspectComponentStructuralDependencies(component),
    diagnostics: component.diagnostics,
  }
}

function createRunelightPreviewTargetsReport(
  inspectReport: RunelightInspectReport,
  options: {
    limit: number
    maxDepth: number | undefined
    maxTargets: number
    offset: number
    order: RunelightPreviewTargetsWalkOrder
  },
): RunelightPreviewTargetsReport {
  const nodesByCoordinate = new Map(inspectReport.nodes.map((node) => [node.coordinate, node] as const))
  const root = nodesByCoordinate.get(inspectReport.root)
  const targets: RunelightPreviewTarget[] = []
  const targetsByPath = new Map<string, RunelightPreviewTarget>()
  const worklist: RunelightPreviewTargetsPathNode[][] = []
  let truncated = false

  const addTarget = (
    pathChain: readonly RunelightPreviewTargetsPathNode[],
    visibleChain: readonly RunelightPreviewTargetsPathNode[] = pathChain,
  ): boolean => {
    const path = runelightPreviewTargetPath(inspectReport.root, pathChain)
    let target = targetsByPath.get(path)
    if (!target) {
      if (targets.length >= options.maxTargets) {
        truncated = true
        return false
      }
      target = { path, paths: [] }
      targetsByPath.set(path, target)
      targets.push(target)
    }

    const signature = JSON.stringify(visibleChain)
    if (!target.paths.some((candidate) => JSON.stringify(candidate) === signature)) {
      target.paths.push(visibleChain.map((node) => ({ ...node })))
    }
    return true
  }

  if (root) {
    const rootChains = root.frames.map((frame) => [toRunelightPreviewTargetsPathNode(root, frame)])
    worklist.push(...(options.order === "breadth-first" ? rootChains : rootChains.reverse()))
  }

  while (worklist.length > 0 && !truncated) {
    const chain = options.order === "breadth-first" ? worklist.shift() : worklist.pop()
    if (!chain) continue
    if (!addTarget(chain)) break

    const depth = chain.length - 1
    if (options.maxDepth !== undefined && depth >= options.maxDepth) continue

    const current = chain[chain.length - 1]
    if (!current) continue
    const node = nodesByCoordinate.get(current.coordinate)
    const frame = node?.frames.find((candidate) => candidate.name === current.frame)
    if (!node || !frame) continue

    const nextChains: RunelightPreviewTargetsPathNode[][] = []
    for (const dependency of frame.dependencies) {
      const dependencyNode = nodesByCoordinate.get(dependency)
      if (!dependencyNode) continue

      for (const dependencyFrame of dependencyNode.frames) {
        const nextNode = toRunelightPreviewTargetsPathNode(dependencyNode, dependencyFrame)
        const cycleStart = chain.findIndex((candidate) => candidate.coordinate === nextNode.coordinate)
        if (cycleStart >= 0) {
          const cycleNode = {
            ...nextNode,
            cycle: true as const,
            cyclePath: [...chain.slice(cycleStart).map((candidate) => candidate.coordinate), nextNode.coordinate],
          }
          if (!addTarget(chain, [...chain, cycleNode])) break
          continue
        }

        nextChains.push([...chain, nextNode])
      }

      if (truncated) break
    }
    worklist.push(...(options.order === "breadth-first" ? nextChains : nextChains.reverse()))
  }

  const totalTargets = targets.length
  const pageTargets = targets.slice(options.offset, options.offset + options.limit)
  const nextOffset = options.offset + pageTargets.length < totalTargets ? options.offset + pageTargets.length : null

  return {
    schemaVersion: 1,
    page: {
      offset: options.offset,
      limit: options.limit,
      currentPageSize: pageTargets.length,
      nextOffset,
      hasMore: nextOffset !== null,
    },
    traversal: {
      order: options.order,
      maxDepth: options.maxDepth ?? null,
      maxTargets: options.maxTargets,
      generatedTargets: totalTargets,
      truncated,
    },
    targets: pageTargets,
    diagnostics: inspectReport.diagnostics,
  }
}

function toRunelightPreviewTargetsPathNode(
  node: RunelightInspectNode,
  frame: RunelightInspectFrame,
): RunelightPreviewTargetsPathNode {
  return {
    coordinate: node.coordinate,
    frame: frame.name,
    description: frame.description,
  }
}

function runelightPreviewTargetPath(
  rootCoordinate: string,
  chain: readonly RunelightPreviewTargetsPathNode[],
): string {
  const rootFrame = chain[0]?.frame ?? ""
  const searchParams = new URLSearchParams({
    entry: rootCoordinate,
    frame: rootFrame,
    chrome: "0",
  })

  for (const node of chain.slice(1)) {
    searchParams.append("frameOverride", encodeRunelightPreviewFrameOverride(node.coordinate, node.frame))
  }

  return `/runelight?${searchParams.toString()}`
}

function inspectComponentStructuralDependencies(component: RunelightProjectIndexComponent): string[] {
  const dependencies = component.frameDependencies
    ? Object.values(component.frameDependencies).flat()
    : component.dependencies ?? []
  return uniqueSorted(dependencies)
}

function inspectFrameStructuralDependencies(component: RunelightProjectIndexComponent, frameName: string): string[] {
  if (component.frameDependencies) return uniqueSorted(component.frameDependencies[frameName] ?? [])
  return uniqueSorted(component.dependencies ?? [])
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function formatRunelightInspectReport(report: RunelightInspectReport): string {
  const lines = [`Runelight inspect: ${report.root}`]
  for (const node of report.nodes) {
    lines.push(`${node.coordinate}`)
    for (const frame of node.frames) {
      const dependencies = frame.dependencies.length > 0 ? ` -> ${frame.dependencies.join(", ")}` : ""
      lines.push(`  - ${frame.name}${dependencies}`)
    }
  }
  for (const diagnostic of report.diagnostics) {
    lines.push(formatDiagnostic(diagnostic))
  }
  return `${lines.join("\n")}\n`
}

function formatRunelightPreviewTargetsReport(report: RunelightPreviewTargetsReport): string {
  const pageEnd = report.page.offset + report.targets.length
  const truncated = report.traversal.truncated ? " (truncated by --max-targets)" : ""
  const lines = [`Runelight preview targets ${report.page.offset}-${pageEnd} of ${report.traversal.generatedTargets} generated${truncated}`]
  if (report.page.hasMore) lines.push(`Next page: --offset ${report.page.nextOffset}`)
  lines.push(...report.targets.map((target) => target.path))
  for (const diagnostic of report.diagnostics) {
    lines.push(formatDiagnostic(diagnostic))
  }
  return `${lines.join("\n")}\n`
}

function normalizeEntryCoordinate(entry: string): string {
  const [file, exportName] = entry.split("#", 2)
  return `${normalizeProjectPath(file ?? entry)}#${exportName || "default"}`
}

function createCLIWorkspaceChangesReport(input: {
  contracts: readonly RunelightContract[]
  contractReferences: readonly unknown[]
  cwd: string
  entryRoot: string
  sourceRoot: string
  tsconfigPath?: string
}): RunelightWorkspaceChangesReport {
  const designRoot = runelightDesignRootFromEntryRoot(input.entryRoot)
  const baselineRoot = runelightBaselineRootFromEntryRoot(input.entryRoot)
  return createRunelightWorkspaceChangesReportFromGit({
    baselineRoot,
    cacheKeyParts: {
      baselineRoot,
      contracts: input.contractReferences,
      entryRoot: input.entryRoot,
    },
    cwd: input.cwd,
    pathspecs: [input.sourceRoot, designRoot],
    runtimeImportSpecifier: baselineRuntimeImportSpecifier(input.contractReferences),
    sourceRoot: input.sourceRoot,
    buildCurrentGraph: () => buildRunelightProjectIndex({
      additionalSourceRoots: [designRoot],
      contracts: input.contracts,
      cwd: input.cwd,
      sourceRoot: input.sourceRoot,
      tsconfigPath: input.tsconfigPath,
    }),
    buildBaselineGraph: ({ cwd }) => {
      const index = buildRunelightProjectIndex({
        additionalSourceRoots: [designRoot],
        contracts: input.contracts,
        cwd,
        sourceRoot: input.sourceRoot,
      })
      return index.files.length === 0 ? undefined : index
    },
  })
}

function filterCLIWorkspaceChangesReport(
  report: RunelightWorkspaceChangesReport,
  options: { component?: string; uiOnly?: boolean },
): RunelightWorkspaceChangesReport {
  const filterApplied = Boolean(options.component) || Boolean(options.uiOnly)
  const components = report.components.filter((component) => {
    if (options.uiOnly && component.uiStatus === "unchanged") return false
    if (!options.component) return true

    return (
      component.componentName === options.component ||
      component.coordinate === options.component ||
      `${component.file}#${component.exportName}` === options.component ||
      component.file === options.component
    )
  })

  return {
    ...report,
    components,
    summary: {
      ...report.summary,
      files: filterApplied ? summarizeCLIWorkspaceChangeFiles(components) : report.summary.files,
      ui: summarizeCLIWorkspaceChangeUI(components),
    },
  }
}

function summarizeCLIWorkspaceChangeFiles(
  components: readonly RunelightWorkspaceChangesReport["components"][number][],
): RunelightWorkspaceChangesReport["summary"]["files"] {
  const files = {
    added: new Set<string>(),
    deleted: new Set<string>(),
    modified: new Set<string>(),
  }
  for (const component of components) {
    files[component.codeStatus].add(component.file)
  }
  return {
    added: files.added.size,
    deleted: files.deleted.size,
    modified: files.modified.size,
  }
}

function summarizeCLIWorkspaceChangeUI(
  components: readonly RunelightWorkspaceChangesReport["components"][number][],
): RunelightWorkspaceChangesReport["summary"]["ui"] {
  return {
    added: components.filter((component) => component.uiStatus === "added").length,
    changed: components.filter((component) => component.uiStatus === "changed").length,
    deleted: components.filter((component) => component.uiStatus === "deleted").length,
    unchanged: components.filter((component) => component.uiStatus === "unchanged").length,
    unknown: components.filter((component) => component.uiStatus === "unknown").length,
  }
}

function formatCLIWorkspaceChangesReport(report: RunelightWorkspaceChangesReport): string {
  if (report.components.length === 0 && report.diagnostics.length === 0) {
    return "No Runelight workspace changes.\n"
  }

  const lines = [
    `Runelight changes${report.base.ref ? ` against ${report.base.ref}` : ""}`,
    `Files: ${formatCount(report.summary.files.added, "added")}, ${formatCount(report.summary.files.modified, "modified")}, ${formatCount(report.summary.files.deleted, "deleted")}`,
    `UI: ${formatCount(report.summary.ui.added, "added")}, ${formatCount(report.summary.ui.changed, "changed")}, ${formatCount(report.summary.ui.deleted, "deleted")}, ${formatCount(report.summary.ui.unknown, "unknown")}, ${formatCount(report.summary.ui.unchanged, "unchanged")}`,
  ]

  for (const component of report.components) {
    lines.push(`${component.uiStatus} ${component.coordinate} (${component.codeStatus})`)
    for (const frame of component.frames) {
      lines.push(`  - ${frame.status} ${frame.name}`)
    }
  }

  for (const diagnostic of report.diagnostics) {
    lines.push(`[${diagnostic.stage}${diagnostic.severity === "warning" ? " warning" : ""}] ${diagnostic.code}: ${diagnostic.message}`)
  }

  return `${lines.join("\n")}\n`
}

function formatCount(value: number, label: string): string {
  return `${value} ${label}`
}

function baselineRuntimeImportSpecifier(contractReferences: readonly unknown[]): string | undefined {
  if (contractReferences.some((specifier) => typeof specifier === "string" && specifier.includes("@runelight/vue/contract"))) return "@runelight/vue/runtime"
  if (contractReferences.some((specifier) => typeof specifier === "string" && specifier.includes("@runelight/react/contract"))) return "@runelight/react/runtime"
  return undefined
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

function isRunelightPreviewTargetsWalkOrder(value: string): value is RunelightPreviewTargetsWalkOrder {
  return value === "breadth-first" || value === "depth-first"
}

function readOptionalNonNegativeIntegerOption(
  args: string[],
  optionName: string,
): { diagnostic?: RunelightDiagnostic; value?: number } {
  if (!args.includes(optionName)) return {}

  const value = readOption(args, optionName)
  if (value !== undefined && /^[0-9]\d*$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return { value: parsed }
  }

  return {
    diagnostic: {
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-non-negative-integer-option",
      message: `Invalid value ${value ?? "<missing>"} for ${optionName}. Use 0 or a positive integer.`,
    },
  }
}

function readNonNegativeIntegerOption(
  args: string[],
  optionName: string,
  defaultValue: number,
): { diagnostic?: RunelightDiagnostic; value: number } {
  if (!args.includes(optionName)) return { value: defaultValue }

  const value = readOption(args, optionName)
  if (value !== undefined && /^[0-9]\d*$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return { value: parsed }
  }

  return {
    value: defaultValue,
    diagnostic: {
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-non-negative-integer-option",
      message: `Invalid value ${value ?? "<missing>"} for ${optionName}. Use 0 or a positive integer.`,
    },
  }
}

function readPositiveIntegerOption(
  args: string[],
  optionName: string,
  defaultValue: number,
): { diagnostic?: RunelightDiagnostic; value: number } {
  if (!args.includes(optionName)) return { value: defaultValue }

  const value = readOption(args, optionName)
  if (value !== undefined && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return { value: parsed }
  }

  return {
    value: defaultValue,
    diagnostic: {
      stage: "adapter-configuration",
      severity: "error",
      code: "invalid-positive-integer-option",
      message: `Invalid value ${value ?? "<missing>"} for ${optionName}. Use a positive integer.`,
    },
  }
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

function validatePreviewPathCaptureArguments(
  args: string[],
  entry: string | undefined,
  previewPath: string,
): RunelightDiagnostic | undefined {
  if (entry) {
    return {
      stage: "browser-capture",
      severity: "error",
      code: "capture-path-conflicts-with-entry",
      message: "Use either capture --path </runelight?...> or capture <entry[#export]|dir>, not both.",
      file: entry,
    }
  }

  const conflictingOptions = ["--frame", "--frame-override"].filter((option) => args.includes(option))
  if (conflictingOptions.length > 0) {
    return {
      stage: "browser-capture",
      severity: "error",
      code: "capture-path-conflicting-options",
      message: `Do not pass ${conflictingOptions.join(", ")} with capture --path; include preview selection in the path instead.`,
    }
  }

  if (!isRunelightPreviewPath(previewPath)) {
    return {
      stage: "browser-capture",
      severity: "error",
      code: "invalid-capture-path",
      message: `Invalid capture path ${previewPath}. Use a relative /runelight path from preview-targets output.`,
    }
  }

  return undefined
}

function validatePreviewPathCaptureOutput(out: string): RunelightDiagnostic | undefined {
  if (out.endsWith(".png")) return undefined

  return {
    stage: "browser-capture",
    severity: "error",
    code: "capture-path-output-must-be-png",
    message: "capture --path writes one image, so --out must be a .png file path.",
  }
}

function isRunelightPreviewPath(value: string): boolean {
  if (!value.startsWith("/")) return false

  try {
    const url = new URL(value, "http://runelight.local")
    return url.origin === "http://runelight.local" && url.pathname === "/runelight"
  } catch {
    return false
  }
}

function runelightPreviewPathCaptureUrl(baseUrl: string, previewPath: string): string {
  return new URL(previewPath, baseUrl).toString()
}

function outForEntryContactSheet(out: string, entry: string): string {
  if (out.endsWith(".png")) return out

  const fileName = outputPathForEntry(entry).split(/[\\/]/).pop() ?? "runelight-capture.png"
  return join(out, fileName)
}

function outForSingleFrame(out: string, entry: string, frameName: string): string {
  if (out.endsWith(".png")) return out

  const fileName = outputPathForEntry(entry).split(/[\\/]/).pop() ?? "runelight-capture.png"
  const baseName = fileName.replace(/\.png$/, "")
  return join(out, `${baseName}.${sanitizeFilePathSegment(frameName)}.png`)
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
