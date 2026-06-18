import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Worker as NodeWorker } from "node:worker_threads"

import {
  classifyRunelightWorkspaceVisualChange,
  isRunelightWorkspaceChangePath,
  prepareRunelightWorkspaceBaselineSource,
  prefixRunelightBaselineGraph,
  readRunelightWorkspaceFileStatuses,
  runelightWorkspaceChangesCacheKey,
  stripRunelightBaselinePathPrefix,
  type RunelightWorkspaceFileStatus,
  type RunelightWorkspaceVisualChangeClassification,
} from "@runelight/changes"
import { loadRunelightConfig, resolveRunelightConfig, runelightBaselineRootFromEntryRoot } from "@runelight/core/config"
import { runelightDesignRootFromEntryRoot, type RunelightConfig } from "@runelight/core"
import { resolveRunelightContractReferences } from "@runelight/core/contract"
import {
  buildRunelightProjectIndex,
  createCachedRunelightProjectIndexBuilder,
  type RunelightProjectIndex,
} from "@runelight/core/project-index"

import {
  createStudioManifest,
  createStudioManifestFromResolvedConfig,
  discoverStudioDesignManifest,
  type StudioManifest,
  type StudioManifestComponent,
  type StudioManifestFile,
} from "./manifest"
import type {
  StudioWorkspaceChangeImpact,
  StudioWorkspaceChangeFrameImpact,
  StudioWorkspaceChangeItem,
  StudioWorkspaceChangeSurface,
  StudioWorkspaceChanges,
  StudioWorkspaceDeletedSummary,
} from "./workspace-changes"

export type CreateStudioManifestProviderOptions = {
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal custom hosts should call `createStudioManifestProvider()` from the project root.
   */
  config?: RunelightConfig
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal custom hosts should call `createStudioManifestProvider()` from the project root.
   */
  cwd?: string
}

/**
 * @internal Adapter-owned Studio changes provider. User automation should use `runelight changes --json`.
 */
export type StudioWorkspaceChangesProvider = () => Promise<StudioWorkspaceChanges>

/**
 * @internal Worker fallback implementation detail for Studio changes.
 */
export type StudioWorkspaceChangesSyncProvider = () => StudioWorkspaceChanges

/**
 * @internal Node worker payload for Studio changes computation.
 */
export type StudioWorkspaceChangesWorkerData = {
  config?: RunelightConfig
  cwd: string
}

type StudioWorkspaceChangesWorkerRequest = {
  id: number
  type: "changes"
}

type StudioWorkspaceChangesWorkerResponse =
  | {
      changes: StudioWorkspaceChanges
      id: number
      ok: true
    }
  | {
      error: string
      id: number
      ok: false
    }

type StudioWorkspaceChangesWorkerPendingRequest = {
  reject: (error: Error) => void
  resolve: (changes: StudioWorkspaceChanges) => void
}

const buildCachedStudioBaselineProjectIndex = createCachedRunelightProjectIndexBuilder({ ttlMs: 30_000 })

export async function createStudioManifestProvider(options: CreateStudioManifestProviderOptions = {}): Promise<() => StudioManifest> {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredRunelightConfig(cwd)
  const resolved = resolveRunelightConfig(config)
  const entryRoot = resolved.project.entryRoot
  const contracts = await resolveRunelightContractReferences(config.contracts, { cwd })
  if (contracts.length === 0) {
    throw new Error('Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].')
  }
  const buildProjectIndex = createCachedRunelightProjectIndexBuilder()

  return () => {
    const projectIndex = buildProjectIndex({
      additionalSourceRoots: studioDesignRoots(entryRoot),
      contracts,
      cwd,
      sourceRoot: resolved.project.sourceRoot,
      tsconfigPath: resolved.project.tsconfig,
    })

    return createStudioManifestFromResolvedConfig(projectIndex, resolved)
  }
}

/**
 * @internal First-party adapters use this to serve Studio's changes route. User automation should use `runelight changes --json`.
 */
export async function createStudioWorkspaceChangesProvider(
  options: CreateStudioManifestProviderOptions = {},
): Promise<StudioWorkspaceChangesProvider> {
  const workerProvider = createStudioWorkspaceChangesWorkerProvider(options)
  if (workerProvider) return workerProvider

  const createChanges = await createStudioWorkspaceChangesSyncProvider(options)
  return async () => createChanges()
}

/**
 * @internal Synchronous changes provider used by the Studio changes worker and tests.
 */
export async function createStudioWorkspaceChangesSyncProvider(
  options: CreateStudioManifestProviderOptions = {},
): Promise<StudioWorkspaceChangesSyncProvider> {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredRunelightConfig(cwd)
  const resolved = resolveRunelightConfig(config)
  const contracts = await resolveRunelightContractReferences(config.contracts, { cwd })
  const entryRoot = resolved.project.entryRoot
  const runtimeImportSpecifier = baselineRuntimeImportSpecifier(config.contracts)
  const sourceRoot = resolved.project.sourceRoot
  const designRoot = runelightDesignRootFromEntryRoot(entryRoot)
  const baselineRoot = runelightBaselineRootFromEntryRoot(entryRoot)
  const pathspecs = [sourceRoot, designRoot]
  let cachedChanges: StudioWorkspaceChanges | undefined
  let cachedChangesKey: string | undefined

  return () => {
    const statuses = readRunelightWorkspaceFileStatuses(cwd, pathspecs)
      .filter((status) => isRunelightWorkspaceChangePath(status.path))
    const cacheKey = runelightWorkspaceChangesCacheKey({
      cacheKeyParts: {
        baselineRoot,
        contracts: config.contracts,
        entryRoot,
      },
      cwd,
      pathspecs,
      runtimeImportSpecifier,
      sourceRoot,
      statuses,
    })
    if (cachedChanges && cachedChangesKey === cacheKey) return cachedChanges

    const changes = createStudioWorkspaceChangesFromManifest(createManifest(), {
      baselineManifest: () => createStudioBaselineManifest({
        contracts,
        cwd,
        entryRoot,
        runtimeImportSpecifier,
        sourceRoot,
      }),
      cwd,
      entryRoot,
      sourceRoot,
      statuses,
    })
    cachedChanges = changes
    cachedChangesKey = cacheKey
    return changes
  }

  function createManifest(): StudioManifest {
    const projectIndex = buildRunelightProjectIndex({
      additionalSourceRoots: studioDesignRoots(entryRoot),
      contracts,
      cwd,
      sourceRoot,
      tsconfigPath: resolved.project.tsconfig,
    })
    return createStudioManifestFromResolvedConfig(projectIndex, resolved)
  }
}

function createStudioWorkspaceChangesWorkerProvider(
  options: CreateStudioManifestProviderOptions,
): StudioWorkspaceChangesProvider | undefined {
  const workerUrl = resolveStudioWorkspaceChangesWorkerUrl()
  if (!workerUrl) return undefined

  let inFlight: Promise<StudioWorkspaceChanges> | undefined
  let nextRequestId = 0
  let worker: NodeWorker | undefined
  const pendingRequests = new Map<number, StudioWorkspaceChangesWorkerPendingRequest>()

  const rejectPendingRequests = (error: Error) => {
    const pending = [...pendingRequests.values()]
    pendingRequests.clear()
    for (const request of pending) request.reject(error)
  }

  const resetWorker = (error?: Error) => {
    const currentWorker = worker
    worker = undefined
    if (error) rejectPendingRequests(error)
    if (currentWorker) void currentWorker.terminate()
  }

  const ensureWorker = () => {
    if (worker) return worker

    try {
      worker = new NodeWorker(workerUrl, {
        workerData: {
          ...(options.config ? { config: options.config } : {}),
          cwd: options.cwd ?? ".",
        } satisfies StudioWorkspaceChangesWorkerData,
      })
    } catch (error) {
      throw error instanceof Error ? error : new Error("Unable to start Runelight Studio changes worker.")
    }

    worker.unref?.()
    worker.on("message", (message: unknown) => {
      if (!isStudioWorkspaceChangesWorkerResponse(message)) return

      const pending = pendingRequests.get(message.id)
      if (!pending) return
      pendingRequests.delete(message.id)

      if (message.ok) {
        pending.resolve(message.changes)
      } else {
        pending.reject(new Error(message.error))
      }
    })
    worker.on("messageerror", (error) => {
      resetWorker(error instanceof Error ? error : new Error("Runelight Studio changes worker message failed."))
    })
    worker.on("error", (error) => {
      resetWorker(error instanceof Error ? error : new Error(String(error)))
    })
    worker.on("exit", (code) => {
      if (!worker) return
      resetWorker(new Error(`Runelight Studio changes worker exited with code ${code}.`))
    })

    return worker
  }

  const requestChanges = () => {
    return new Promise<StudioWorkspaceChanges>((resolveChanges, rejectChanges) => {
      let currentWorker: NodeWorker
      try {
        currentWorker = ensureWorker()
      } catch (error) {
        rejectChanges(error instanceof Error ? error : new Error("Unable to start Runelight Studio changes worker."))
        return
      }

      const id = ++nextRequestId
      const request: StudioWorkspaceChangesWorkerRequest = { id, type: "changes" }
      pendingRequests.set(id, { reject: rejectChanges, resolve: resolveChanges })
      try {
        currentWorker.postMessage(request)
      } catch (error) {
        pendingRequests.delete(id)
        rejectChanges(error instanceof Error ? error : new Error("Unable to request Runelight Studio workspace changes."))
      }
    })
  }

  return () => {
    inFlight ??= requestChanges().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }
}

function resolveStudioWorkspaceChangesWorkerUrl(): URL | undefined {
  const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), "manifest-server-worker.js")
  if (!existsSync(workerPath)) return undefined
  const workerUrl = pathToFileURL(workerPath)
  return workerUrl
}

function isStudioWorkspaceChangesWorkerResponse(value: unknown): value is StudioWorkspaceChangesWorkerResponse {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<StudioWorkspaceChangesWorkerResponse>
  return typeof candidate.id === "number" && typeof candidate.ok === "boolean"
}

/**
 * @internal Studio changes classifier bridge from manifest graph to client/server payload.
 */
export function createStudioWorkspaceChangesFromManifest(
  manifest: StudioManifest,
  options: {
    baselineManifest?: StudioManifest | (() => StudioManifest | undefined)
    cwd: string
    entryRoot: string
    sourceRoot: string
    statuses?: readonly RunelightWorkspaceFileStatus[]
  },
): StudioWorkspaceChanges {
  const designRoot = runelightDesignRootFromEntryRoot(options.entryRoot)
  const baselineRoot = runelightBaselineRootFromEntryRoot(options.entryRoot)
  const statuses = options.statuses
    ? [...options.statuses]
    : readRunelightWorkspaceFileStatuses(options.cwd, [options.sourceRoot, designRoot])
      .filter((status) => isRunelightWorkspaceChangePath(status.path))
  const baselineManifest = statuses.some((status) => status.kind !== "added")
    ? resolveStudioBaselineManifest(options.baselineManifest)
    : undefined
  const filesByPath = new Map(manifest.files.map((file) => [file.path, file] as const))
  const baselineFilesByOriginalPath = new Map(
    (baselineManifest?.files ?? []).map((file) => [stripRunelightBaselinePathPrefix(file.path, `${baselineRoot}/`), file] as const),
  )

  const items = statuses.flatMap((status) => {
    const currentFile = filesByPath.get(status.path)
    const baselineFile = status.kind === "added" ? undefined : baselineFilesByOriginalPath.get(status.path)
    const surface = studioWorkspaceChangeSurfaceForPath(status.path, designRoot)
    const currentImpacts = currentFile ? studioWorkspaceChangeImpacts(manifest, currentFile, surface) : []
    const baselineImpacts = baselineManifest && baselineFile
      ? studioWorkspaceChangeImpacts(baselineManifest, baselineFile, surface)
      : []
    const item: StudioWorkspaceChangeItem = {
      filePath: status.path,
      kind: status.kind,
      surface,
      impacts: currentImpacts.length > 0 ? currentImpacts : baselineImpacts,
      ...(baselineFile ? { baselineFile, baselineImpacts } : {}),
      ...(currentFile ? { currentFile } : {}),
      ...(status.kind === "deleted" ? { deletedSummary: readDeletedStudioWorkspaceSummary(options.cwd, status.path) } : {}),
    }
    if (!studioWorkspaceChangeItemHasPreviewSurface(item)) return []

    const visualItem = studioWorkspaceChangeItemWithVisualChanges(item, {
      baselineManifest,
      baselineRoot,
      manifest,
    })
    return visualItem ? [visualItem] : []
  })

  return {
    version: 1,
    base: statuses.length > 0
      ? { kind: "git", baselineRoot, ref: "HEAD", ...(baselineManifest ? { manifest: baselineManifest } : {}) }
      : { kind: "none" },
    items,
  }
}

function studioWorkspaceChangeItemHasPreviewSurface(item: StudioWorkspaceChangeItem): boolean {
  return (
    item.impacts.length > 0 ||
    (item.baselineImpacts?.length ?? 0) > 0 ||
    (item.currentFile?.components.length ?? 0) > 0 ||
    (item.baselineFile?.components.length ?? 0) > 0
  )
}

function studioWorkspaceChangeItemWithVisualChanges(
  item: StudioWorkspaceChangeItem,
  options: { baselineManifest?: StudioManifest; baselineRoot: string; manifest: StudioManifest },
): StudioWorkspaceChangeItem | undefined {
  if (item.kind === "added") {
    return {
      ...item,
      impacts: item.impacts.map((impact) => studioWorkspaceChangeImpactWithStaticFrameKind(impact, "added")),
    }
  }
  if (item.kind === "deleted") {
    return {
      ...item,
      impacts: item.impacts.map((impact) => studioWorkspaceChangeImpactWithStaticFrameKind(impact, "deleted")),
      ...(item.baselineImpacts ? {
        baselineImpacts: item.baselineImpacts.map((impact) => studioWorkspaceChangeImpactWithStaticFrameKind(impact, "deleted")),
      } : {}),
    }
  }
  if (!item.currentFile || !item.baselineFile || !options.baselineManifest) return item

  const ownClassification = classifyRunelightWorkspaceVisualChange({
    baselineFile: item.baselineFile,
    baselineGraph: options.baselineManifest,
    baselinePathPrefix: `${options.baselineRoot}/`,
    currentFile: item.currentFile,
    currentGraph: options.manifest,
  })
  if (ownClassification.kind === "unchanged") return undefined

  const classification = classifyRunelightWorkspaceVisualChange({
    baselineFile: item.baselineFile,
    baselineGraph: options.baselineManifest,
    baselinePathPrefix: `${options.baselineRoot}/`,
    componentKeys: studioWorkspaceChangeImpactComponentKeys(item, options.baselineRoot),
    currentFile: item.currentFile,
    currentGraph: options.manifest,
  })
  if (classification.kind === "unchanged") return undefined

  return {
    ...item,
    impacts: studioWorkspaceChangeImpactsWithFrameChanges(item.impacts, classification, options.baselineRoot),
    ...(item.baselineImpacts ? {
      baselineImpacts: studioWorkspaceChangeImpactsWithFrameChanges(item.baselineImpacts, classification, options.baselineRoot),
    } : {}),
  }
}

function studioWorkspaceChangeImpactWithStaticFrameKind(
  impact: StudioWorkspaceChangeImpact,
  kind: StudioWorkspaceChangeFrameImpact["kind"],
): StudioWorkspaceChangeImpact {
  return {
    ...impact,
    frames: impact.frameNames.map((name) => ({ kind, name })),
  }
}

function studioWorkspaceChangeImpactsWithFrameChanges(
  impacts: StudioWorkspaceChangeImpact[],
  classification: RunelightWorkspaceVisualChangeClassification,
  baselineRoot: string,
): StudioWorkspaceChangeImpact[] {
  return impacts.map((impact) => {
    const key = studioVisualComponentKeyForCoordinate(impact.rootCoordinate, baselineRoot)
    const frameNames = new Set(impact.frameNames)
    const frames = classification.frameChangesByComponentKey[key]?.filter((frame) => frameNames.has(frame.name)) ?? []
    return {
      ...impact,
      ...(frames.length > 0 ? { frames } : {}),
    }
  })
}

function studioWorkspaceChangeImpactComponentKeys(item: StudioWorkspaceChangeItem, baselineRoot: string): string[] {
  return [...new Set(
    [...item.impacts, ...(item.baselineImpacts ?? [])]
      .map((impact) => studioVisualComponentKeyForCoordinate(impact.rootCoordinate, baselineRoot)),
  )]
}

function studioVisualComponentKeyForCoordinate(coordinate: string, baselineRoot: string): string {
  const separatorIndex = coordinate.lastIndexOf("#")
  if (separatorIndex < 0) return stripStudioBaselinePathPrefix(coordinate, baselineRoot)
  return `${stripStudioBaselinePathPrefix(coordinate.slice(0, separatorIndex), baselineRoot)}${coordinate.slice(separatorIndex)}`
}

function stripStudioBaselinePathPrefix(path: string, baselineRoot: string): string {
  return stripRunelightBaselinePathPrefix(path, `${baselineRoot}/`)
}

function resolveStudioBaselineManifest(
  baselineManifest: StudioManifest | (() => StudioManifest | undefined) | undefined,
): StudioManifest | undefined {
  return typeof baselineManifest === "function" ? baselineManifest() : baselineManifest
}

/**
 * @internal Builds the baseline manifest used by Studio's before-state previews.
 */
export function createStudioBaselineManifest(input: {
  contracts: Parameters<typeof buildRunelightProjectIndex>[0]["contracts"]
  cwd: string
  entryRoot: string
  runtimeImportSpecifier?: string
  sourceRoot: string
}): StudioManifest | undefined {
  const baselineRoot = runelightBaselineRootFromEntryRoot(input.entryRoot)
  const designRoot = runelightDesignRootFromEntryRoot(input.entryRoot)
  const prepared = prepareRunelightWorkspaceBaselineSource({
    baselineRoot,
    cacheKeyParts: { entryRoot: input.entryRoot },
    cwd: input.cwd,
    pathspecs: [input.sourceRoot, designRoot],
    runtimeImportSpecifier: input.runtimeImportSpecifier,
    sourceRoot: input.sourceRoot,
  })
  if (!prepared) return undefined

  const baselineAbsoluteRoot = resolve(input.cwd, baselineRoot)
  const projectIndex = buildCachedStudioBaselineProjectIndex({
    additionalSourceRoots: [designRoot],
    contracts: input.contracts,
    cwd: baselineAbsoluteRoot,
    sourceRoot: input.sourceRoot,
  })
  if (projectIndex.files.length === 0) return undefined

  return prefixStudioBaselineManifest(createStudioManifest(projectIndex as RunelightProjectIndex, {
    design: discoverStudioDesignManifest(projectIndex as RunelightProjectIndex, input.entryRoot),
  }), baselineRoot)
}

function studioDesignRoots(entryRoot: string): string[] {
  return [runelightDesignRootFromEntryRoot(entryRoot)]
}

function loadRequiredRunelightConfig(cwd: string): RunelightConfig {
  const result = loadRunelightConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing runelight.config.ts.")
}

function baselineRuntimeImportSpecifier(contracts: readonly string[]): string | undefined {
  if (contracts.some((specifier) => specifier.includes("@runelight/vue/contract"))) return "@runelight/vue/runtime"
  if (contracts.some((specifier) => specifier.includes("@runelight/react/contract"))) return "@runelight/react/runtime"
  return undefined
}

function prefixStudioBaselineManifest(manifest: StudioManifest, baselineRoot: string): StudioManifest {
  const prefixPath = (path: string) => `${baselineRoot}/${path}`.replaceAll("\\", "/")
  const prefixCoordinate = (coordinate: string) => {
    const separatorIndex = coordinate.lastIndexOf("#")
    if (separatorIndex < 0) return prefixPath(coordinate)

    return `${prefixPath(coordinate.slice(0, separatorIndex))}${coordinate.slice(separatorIndex)}`
  }
  const prefixedManifest = prefixRunelightBaselineGraph(manifest, baselineRoot)

  return {
    ...prefixedManifest,
    ...(manifest.design ? {
      design: {
        frames: manifest.design.frames.map((frame) => ({
          ...frame,
          entry: prefixCoordinate(frame.entry),
          filePath: prefixPath(frame.filePath),
          id: `${prefixCoordinate(frame.entry)}:${frame.frameName}`,
        })),
      },
    } : {}),
  }
}

function studioWorkspaceChangeSurfaceForPath(path: string, designRoot: string): StudioWorkspaceChangeSurface {
  return path === designRoot || path.startsWith(`${designRoot}/`) ? "drafts" : "frames"
}

function studioWorkspaceChangeImpacts(
  manifest: StudioManifest,
  file: StudioManifestFile,
  surface: StudioWorkspaceChangeSurface,
): StudioWorkspaceChangeImpact[] {
  if (surface === "drafts") {
    return file.components.map((component) => ({
      frameNames: component.frames.map((frame) => frame.name),
      path: [{ componentName: component.componentName, coordinate: component.coordinate }],
      rootComponentName: component.componentName,
      rootCoordinate: component.coordinate,
      surface,
    }))
  }

  const components = manifest.files.flatMap((candidate) =>
    candidate.components.filter((component) => !isStudioDesignComponent(manifest, component)),
  )
  const componentsByCoordinate = new Map(components.map((component) => [component.coordinate, component] as const))
  const childCoordinates = new Set(components.flatMap((component) => component.dependencies ?? []))
  const rootComponents = components.filter((component) => !childCoordinates.has(component.coordinate))
  const roots = rootComponents.length > 0 ? rootComponents : components
  const changedCoordinates = new Set(file.components.map((component) => component.coordinate))
  const impacts: StudioWorkspaceChangeImpact[] = []
  const seen = new Set<string>()

  for (const targetCoordinate of changedCoordinates) {
    const target = componentsByCoordinate.get(targetCoordinate)
    if (!target) continue

    if (seen.has(target.coordinate)) continue
    seen.add(target.coordinate)

    const path = studioWorkspaceChangePathToTarget(target, roots, componentsByCoordinate)
    impacts.push({
      frameNames: target.frames.map((frame) => frame.name),
      path: path.map((component) => ({
        componentName: component.componentName,
        coordinate: component.coordinate,
      })),
      rootComponentName: target.componentName,
      rootCoordinate: target.coordinate,
      surface,
    })
  }

  return impacts
}

function studioWorkspaceChangePathToTarget(
  target: StudioManifestComponent,
  roots: StudioManifestComponent[],
  componentsByCoordinate: ReadonlyMap<string, StudioManifestComponent>,
): StudioManifestComponent[] {
  for (const root of roots) {
    if (root.coordinate === target.coordinate) return [target]
    const [path] = dependencyPathsToTarget(root, target.coordinate, componentsByCoordinate)
    if (path) return path
  }

  return [target]
}

function dependencyPathsToTarget(
  root: StudioManifestComponent,
  targetCoordinate: string,
  componentsByCoordinate: ReadonlyMap<string, StudioManifestComponent>,
): StudioManifestComponent[][] {
  const paths: StudioManifestComponent[][] = []
  const visit = (component: StudioManifestComponent, path: StudioManifestComponent[], seen: Set<string>) => {
    if (seen.has(component.coordinate)) return

    const nextPath = [...path, component]
    if (component.coordinate === targetCoordinate) {
      paths.push(nextPath)
      return
    }

    const nextSeen = new Set(seen)
    nextSeen.add(component.coordinate)
    for (const dependencyCoordinate of component.dependencies ?? []) {
      const dependency = componentsByCoordinate.get(dependencyCoordinate)
      if (dependency) visit(dependency, nextPath, nextSeen)
    }
  }

  visit(root, [], new Set())
  return paths
}

function isStudioDesignComponent(manifest: StudioManifest, component: StudioManifestComponent): boolean {
  return (manifest.design?.frames ?? []).some((frame) => frame.entry === component.coordinate)
}

function readDeletedStudioWorkspaceSummary(cwd: string, path: string): StudioWorkspaceDeletedSummary | undefined {
  let source: string
  try {
    source = execFileSync("git", ["-C", cwd, "show", `HEAD:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return undefined
  }

  const componentNames = [...componentNamesFromSource(source)]
  const frameNames = [...frameNamesFromSource(source)]
  if (componentNames.length === 0 && frameNames.length === 0) return undefined

  return {
    ...(componentNames.length > 0 ? { componentNames } : {}),
    ...(frameNames.length > 0 ? { frameNames } : {}),
  }
}

function componentNamesFromSource(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g)) names.add(match[1])
  for (const match of source.matchAll(/export\s+function\s+([A-Z][A-Za-z0-9_]*)/g)) names.add(match[1])
  for (const match of source.matchAll(/([A-Z][A-Za-z0-9_]*)\.frames\s*=/g)) names.add(match[1])
  return names
}

function frameNamesFromSource(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(/\.frames\s*=\s*\{([\s\S]*?)\}\s*(?:satisfies|;|\n|$)/g)) {
    for (const frameMatch of match[1].matchAll(/([A-Za-z0-9_-]+)\s*:/g)) names.add(frameMatch[1])
  }
  return names
}
