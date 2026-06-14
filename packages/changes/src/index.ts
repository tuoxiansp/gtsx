import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightVisualDiffComponent = {
  componentName?: string
  coordinate: string
  dependencies?: readonly string[]
  frameDependencies?: Record<string, readonly string[]>
  exportName: string
  filePath: string
  frames?: readonly { name: string }[]
  frameVisualSignatures?: Record<string, string>
  sourceHash?: string
  visualSignature?: string
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightVisualDiffFile = {
  components: readonly RunelightVisualDiffComponent[]
  path: string
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightVisualDiffGraphInput = {
  files: readonly RunelightVisualDiffFile[]
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceVisualChangeKind = "changed" | "unchanged" | "unknown"

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceVisualFrameChangeKind = "added" | "deleted" | "changed" | "unchanged" | "unknown"

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceVisualFrameChange = {
  kind: RunelightWorkspaceVisualFrameChangeKind
  name: string
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceVisualChangeClassification = {
  changedComponentKeys: string[]
  frameChangesByComponentKey: Record<string, RunelightWorkspaceVisualFrameChange[]>
  kind: RunelightWorkspaceVisualChangeKind
  unknownComponentKeys: string[]
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type ClassifyRunelightWorkspaceVisualChangeInput = {
  baselineFile?: RunelightVisualDiffFile
  baselineGraph?: RunelightVisualDiffGraphInput
  baselinePathPrefix?: string
  componentKeys?: readonly string[]
  currentFile?: RunelightVisualDiffFile
  currentGraph: RunelightVisualDiffGraphInput
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceFileChangeKind = "added" | "modified" | "deleted"

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceComponentUIStatus = "added" | "deleted" | "changed" | "unchanged" | "unknown"

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceFileStatus = {
  kind: RunelightWorkspaceFileChangeKind
  path: string
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceChangesFrameReport = {
  name: string
  status: RunelightWorkspaceVisualFrameChangeKind
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceChangesComponentReport = {
  codeStatus: RunelightWorkspaceFileChangeKind
  componentName?: string
  coordinate: string
  exportName: string
  file: string
  frames: RunelightWorkspaceChangesFrameReport[]
  uiStatus: RunelightWorkspaceComponentUIStatus
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification. User automation should use `runelight changes --json`.
 */
export type RunelightWorkspaceChangesReport = {
  base: {
    kind: "git" | "none"
    ref?: string
  }
  components: RunelightWorkspaceChangesComponentReport[]
  diagnostics: Array<{
    code: string
    file?: string
    message: string
    severity: "error" | "warning"
    stage: string
  }>
  schemaVersion: 1
  summary: {
    files: Record<RunelightWorkspaceFileChangeKind, number>
    ui: Record<RunelightWorkspaceComponentUIStatus, number>
  }
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type CreateRunelightWorkspaceChangesReportInput = {
  baseRef?: string
  baselineGraph?: RunelightVisualDiffGraphInput
  baselinePathPrefix?: string
  currentGraph: RunelightVisualDiffGraphInput
  diagnostics?: RunelightWorkspaceChangesReport["diagnostics"]
  statuses: readonly RunelightWorkspaceFileStatus[]
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type RunelightWorkspaceChangesGraphInput = RunelightVisualDiffGraphInput & {
  diagnostics?: RunelightWorkspaceChangesReport["diagnostics"]
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export type CreateRunelightWorkspaceChangesReportFromGitInput = {
  baselineRoot: string
  buildBaselineGraph: (input: { cwd: string }) => RunelightWorkspaceChangesGraphInput | undefined
  buildCurrentGraph: () => RunelightWorkspaceChangesGraphInput
  cacheKeyParts?: Record<string, unknown>
  cwd: string
  pathspecs: readonly string[]
  runtimeImportSpecifier?: string
  sourceRoot: string
}

type VisualGraph = {
  componentsByKey: Map<string, RunelightVisualDiffComponent>
  coordinateToKey: Map<string, string>
}

const effectiveSignatureCacheUnknown = Symbol("runelight.visual-diff.unknown")

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function classifyRunelightWorkspaceVisualChange(
  input: ClassifyRunelightWorkspaceVisualChangeInput,
): RunelightWorkspaceVisualChangeClassification {
  const currentGraph = createRunelightVisualGraph(input.currentGraph, { baselinePathPrefix: input.baselinePathPrefix })
  const baselineGraph = input.baselineGraph
    ? createRunelightVisualGraph(input.baselineGraph, { baselinePathPrefix: input.baselinePathPrefix })
    : undefined

  if (!baselineGraph) {
    return {
      changedComponentKeys: [],
      frameChangesByComponentKey: {},
      kind: "unknown",
      unknownComponentKeys: visualFileComponentKeys(input.currentFile, input.baselinePathPrefix),
    }
  }

  const componentKeys = new Set(
    input.componentKeys?.map((key) => stripRunelightBaselinePathPrefix(key, input.baselinePathPrefix)) ?? [
      ...visualFileComponentKeys(input.currentFile, input.baselinePathPrefix),
      ...visualFileComponentKeys(input.baselineFile, input.baselinePathPrefix),
    ],
  )
  if (componentKeys.size === 0) {
    return { changedComponentKeys: [], frameChangesByComponentKey: {}, kind: "unknown", unknownComponentKeys: [] }
  }

  const changedComponentKeys: string[] = []
  const unknownComponentKeys: string[] = []
  const frameChangesByComponentKey: Record<string, RunelightWorkspaceVisualFrameChange[]> = {}
  const currentSignatures = new Map<string, string | typeof effectiveSignatureCacheUnknown>()
  const baselineSignatures = new Map<string, string | typeof effectiveSignatureCacheUnknown>()
  const currentFrameSignatures = new Map<string, string | typeof effectiveSignatureCacheUnknown>()
  const baselineFrameSignatures = new Map<string, string | typeof effectiveSignatureCacheUnknown>()

  for (const key of componentKeys) {
    const currentComponent = currentGraph.componentsByKey.get(key)
    const baselineComponent = baselineGraph.componentsByKey.get(key)
    const frameChanges = runelightVisualFrameChanges({
      baselineComponent,
      baselineFrameSignatures,
      baselineGraph,
      currentComponent,
      currentFrameSignatures,
      currentGraph,
      key,
    })
    frameChangesByComponentKey[key] = frameChanges

    if (!currentComponent || !baselineComponent) {
      changedComponentKeys.push(key)
      continue
    }

    const currentSignature = runelightEffectiveVisualSignature(currentGraph, key, currentSignatures, new Set())
    const baselineSignature = runelightEffectiveVisualSignature(baselineGraph, key, baselineSignatures, new Set())
    if (currentSignature === effectiveSignatureCacheUnknown || baselineSignature === effectiveSignatureCacheUnknown) {
      unknownComponentKeys.push(key)
      continue
    }
    if (
      currentSignature !== baselineSignature ||
      frameChanges.some((frame) => frame.kind === "added" || frame.kind === "deleted" || frame.kind === "changed")
    ) {
      changedComponentKeys.push(key)
    } else if (frameChanges.some((frame) => frame.kind === "unknown")) {
      unknownComponentKeys.push(key)
    }
  }

  return {
    changedComponentKeys,
    frameChangesByComponentKey,
    kind: changedComponentKeys.length > 0 ? "changed" : unknownComponentKeys.length > 0 ? "unknown" : "unchanged",
    unknownComponentKeys,
  }
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function createRunelightVisualGraph(
  input: RunelightVisualDiffGraphInput,
  options: { baselinePathPrefix?: string } = {},
): VisualGraph {
  const componentsByKey = new Map<string, RunelightVisualDiffComponent>()
  const coordinateToKey = new Map<string, string>()

  for (const file of input.files) {
    for (const component of file.components) {
      const key = runelightVisualComponentKey(component, options.baselinePathPrefix)
      componentsByKey.set(key, component)
      coordinateToKey.set(component.coordinate, key)
      coordinateToKey.set(stripRunelightBaselinePathPrefix(component.coordinate, options.baselinePathPrefix), key)
    }
  }

  return { componentsByKey, coordinateToKey }
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function runelightVisualComponentKey(
  component: Pick<RunelightVisualDiffComponent, "exportName" | "filePath">,
  baselinePathPrefix?: string,
): string {
  return `${stripRunelightBaselinePathPrefix(component.filePath, baselinePathPrefix)}#${component.exportName}`
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification. User automation should use `runelight changes --json`.
 */
export function createRunelightWorkspaceChangesReportFromGit(
  input: CreateRunelightWorkspaceChangesReportFromGitInput,
): RunelightWorkspaceChangesReport {
  const baselineRoot = input.baselineRoot
  const statuses = readRunelightWorkspaceFileStatuses(input.cwd, input.pathspecs)
    .filter((status) => isRunelightWorkspaceChangePath(status.path))
  const currentGraph = input.buildCurrentGraph()
  const baselineGraph = statuses.some((status) => status.kind !== "added") && prepareRunelightWorkspaceBaselineSource({
    baselineRoot,
    cacheKeyParts: input.cacheKeyParts,
    cwd: input.cwd,
    pathspecs: input.pathspecs,
    runtimeImportSpecifier: input.runtimeImportSpecifier,
    sourceRoot: input.sourceRoot,
  })
    ? prefixRunelightBaselineGraph(
        input.buildBaselineGraph({ cwd: resolve(input.cwd, baselineRoot) }),
        baselineRoot,
      )
    : undefined

  return createRunelightWorkspaceChangesReport({
    baseRef: "HEAD",
    baselineGraph,
    baselinePathPrefix: `${baselineRoot}/`,
    currentGraph,
    diagnostics: [...(currentGraph.diagnostics ?? []), ...(baselineGraph?.diagnostics ?? [])],
    statuses,
  })
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function readRunelightWorkspaceFileStatuses(cwd: string, pathspecs: readonly string[]): RunelightWorkspaceFileStatus[] {
  let output: string
  try {
    output = execFileSync("git", ["-C", cwd, "status", "--porcelain=v1", "--untracked-files=all", "--", ...pathspecs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return []
  }

  return output
    .split(/\r?\n/)
    .flatMap((line) => parseGitStatusLine(line))
    .sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function isRunelightWorkspaceChangePath(path: string): boolean {
  return path.endsWith(".g.tsx") || path.endsWith(".g.vue")
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function runelightWorkspaceChangesCacheKey(input: {
  cacheKeyParts?: Record<string, unknown>
  cwd: string
  pathspecs: readonly string[]
  runtimeImportSpecifier?: string
  sourceRoot: string
  statuses: readonly RunelightWorkspaceFileStatus[]
}): string {
  return JSON.stringify({
    ...input.cacheKeyParts,
    head: readGitHeadRevision(input.cwd),
    pathspecs: [...input.pathspecs],
    runtimeImportSpecifier: input.runtimeImportSpecifier,
    sourceRoot: input.sourceRoot,
    statuses: input.statuses.map((status) => ({
      kind: status.kind,
      path: status.path,
      sourceHash: status.kind === "deleted" ? undefined : hashFileIfExists(input.cwd, status.path),
    })),
  })
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function prepareRunelightWorkspaceBaselineSource(input: {
  baselineRoot: string
  cacheKeyParts?: Record<string, unknown>
  cwd: string
  pathspecs: readonly string[]
  runtimeImportSpecifier?: string
  sourceRoot: string
}): boolean {
  const baselineRoot = input.baselineRoot
  const baselineAbsoluteRoot = resolve(input.cwd, baselineRoot)
  const cacheKey = runelightBaselineSourceCacheKey({ ...input, baselineRoot })
  const cacheKeyPath = resolve(baselineAbsoluteRoot, ".baseline-key")
  if (readTextFileIfExists(cacheKeyPath) === cacheKey) return true

  const filePaths = readGitHeadFiles(input.cwd, input.pathspecs)
  if (filePaths.length === 0) return false

  for (const filePath of filePaths) {
    const content = readGitHeadFile(input.cwd, filePath)
    if (!content) continue

    const outputPath = resolve(input.cwd, baselineRoot, filePath)
    mkdirSync(dirname(outputPath), { recursive: true })
    if (shouldRewriteBaselineSourceImports(filePath)) {
      writeFileSync(outputPath, rewriteRunelightWorkspaceBaselineSourceImports(content.toString("utf8"), {
        baselineRoot,
        filePath,
        runtimeImportSpecifier: input.runtimeImportSpecifier,
        sourceRoot: input.sourceRoot,
      }))
    } else {
      writeFileSync(outputPath, content)
    }
  }

  mkdirSync(baselineAbsoluteRoot, { recursive: true })
  writeFileSync(cacheKeyPath, cacheKey)
  writeFileSync(resolve(baselineAbsoluteRoot, "runelight.config.js"), "module.exports = {}\n")
  return true
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function prefixRunelightBaselineGraph<T extends RunelightVisualDiffGraphInput | undefined>(
  graph: T,
  baselineRoot: string,
): T {
  if (!graph) return graph

  const prefixPath = (path: string) => `${baselineRoot}/${path}`.replaceAll("\\", "/")
  const prefixCoordinate = (coordinate: string) => {
    const separatorIndex = coordinate.lastIndexOf("#")
    if (separatorIndex < 0) return prefixPath(coordinate)
    return `${prefixPath(coordinate.slice(0, separatorIndex))}${coordinate.slice(separatorIndex)}`
  }

  return {
    ...graph,
    files: graph.files.map((file) => ({
      ...file,
      path: prefixPath(file.path),
      components: file.components.map((component) => ({
        ...component,
        coordinate: prefixCoordinate(component.coordinate),
        filePath: prefixPath(component.filePath),
        ...(component.dependencies ? { dependencies: component.dependencies.map(prefixCoordinate) } : {}),
        ...(component.frameDependencies ? {
          frameDependencies: Object.fromEntries(
            Object.entries(component.frameDependencies).map(([frameName, dependencies]) => [
              frameName,
              dependencies.map(prefixCoordinate),
            ]),
          ),
        } : {}),
      })),
    })),
  } as T
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification. User automation should use `runelight changes --json`.
 */
export function createRunelightWorkspaceChangesReport(
  input: CreateRunelightWorkspaceChangesReportInput,
): RunelightWorkspaceChangesReport {
  const currentGraph = createRunelightVisualGraph(input.currentGraph, { baselinePathPrefix: input.baselinePathPrefix })
  const baselineGraph = input.baselineGraph
    ? createRunelightVisualGraph(input.baselineGraph, { baselinePathPrefix: input.baselinePathPrefix })
    : undefined
  const currentFilesByPath = new Map(input.currentGraph.files.map((file) => [file.path, file] as const))
  const baselineFilesByOriginalPath = new Map(
    (input.baselineGraph?.files ?? []).map((file) => [
      stripRunelightBaselinePathPrefix(file.path, input.baselinePathPrefix),
      file,
    ] as const),
  )
  const components: RunelightWorkspaceChangesComponentReport[] = []

  for (const status of input.statuses) {
    const currentFile = currentFilesByPath.get(status.path)
    const baselineFile = baselineFilesByOriginalPath.get(status.path)

    if (status.kind === "added") {
      for (const component of currentFile?.components ?? []) {
        components.push(runelightWorkspaceChangesComponentReport(status, component, "added", runelightStaticFrameReports(component, "added"), input.baselinePathPrefix))
      }
      continue
    }

    if (status.kind === "deleted") {
      for (const component of baselineFile?.components ?? []) {
        components.push(runelightWorkspaceChangesComponentReport(status, component, "deleted", runelightStaticFrameReports(component, "deleted"), input.baselinePathPrefix))
      }
      continue
    }

    const classification = classifyRunelightWorkspaceVisualChange({
      baselineFile,
      baselineGraph: input.baselineGraph,
      baselinePathPrefix: input.baselinePathPrefix,
      currentFile,
      currentGraph: input.currentGraph,
    })
    const componentKeys = new Set([
      ...visualFileComponentKeys(currentFile, input.baselinePathPrefix),
      ...visualFileComponentKeys(baselineFile, input.baselinePathPrefix),
    ])

    for (const key of [...componentKeys].sort()) {
      const component = currentGraph.componentsByKey.get(key) ?? baselineGraph?.componentsByKey.get(key)
      if (!component) continue

      const uiStatus: RunelightWorkspaceComponentUIStatus = classification.changedComponentKeys.includes(key)
        ? "changed"
        : classification.unknownComponentKeys.includes(key)
          ? "unknown"
          : "unchanged"
      const frameChanges = classification.frameChangesByComponentKey[key]
      const frames = frameChanges
        ? frameChanges.map((frame) => ({ name: frame.name, status: frame.kind }))
        : runelightStaticFrameReports(component, uiStatus === "unknown" ? "unknown" : "unchanged")

      components.push(runelightWorkspaceChangesComponentReport(status, component, uiStatus, frames, input.baselinePathPrefix))
    }
  }

  const files = {
    added: input.statuses.filter((status) => status.kind === "added").length,
    deleted: input.statuses.filter((status) => status.kind === "deleted").length,
    modified: input.statuses.filter((status) => status.kind === "modified").length,
  }
  const ui = {
    added: components.filter((component) => component.uiStatus === "added").length,
    changed: components.filter((component) => component.uiStatus === "changed").length,
    deleted: components.filter((component) => component.uiStatus === "deleted").length,
    unchanged: components.filter((component) => component.uiStatus === "unchanged").length,
    unknown: components.filter((component) => component.uiStatus === "unknown").length,
  }

  return {
    base: input.statuses.length > 0 ? { kind: "git", ref: input.baseRef ?? "HEAD" } : { kind: "none" },
    components,
    diagnostics: input.diagnostics ?? [],
    schemaVersion: 1,
    summary: { files, ui },
  }
}

function runelightWorkspaceChangesComponentReport(
  status: RunelightWorkspaceFileStatus,
  component: RunelightVisualDiffComponent,
  uiStatus: RunelightWorkspaceComponentUIStatus,
  frames: readonly RunelightWorkspaceChangesFrameReport[],
  baselinePathPrefix?: string,
): RunelightWorkspaceChangesComponentReport {
  return {
    codeStatus: status.kind,
    componentName: "componentName" in component && typeof component.componentName === "string" ? component.componentName : undefined,
    coordinate: stripRunelightBaselinePathPrefix(component.coordinate, baselinePathPrefix),
    exportName: component.exportName,
    file: status.path,
    frames: [...frames],
    uiStatus,
  }
}

function runelightStaticFrameReports(
  component: RunelightVisualDiffComponent,
  kind: RunelightWorkspaceVisualFrameChangeKind,
): RunelightWorkspaceChangesFrameReport[] {
  const frameNames = component.frames?.map((frame) => frame.name) ?? Object.keys(component.frameVisualSignatures ?? {})
  return frameNames.map((name) => ({ name, status: kind }))
}

function visualFileComponentKeys(file: RunelightVisualDiffFile | undefined, baselinePathPrefix: string | undefined): string[] {
  return file?.components.map((component) => runelightVisualComponentKey(component, baselinePathPrefix)) ?? []
}

function runelightEffectiveVisualSignature(
  graph: VisualGraph,
  key: string,
  cache: Map<string, string | typeof effectiveSignatureCacheUnknown>,
  visiting: Set<string>,
): string | typeof effectiveSignatureCacheUnknown {
  const cached = cache.get(key)
  if (cached) return cached

  const component = graph.componentsByKey.get(key)
  if (!component?.visualSignature) {
    cache.set(key, effectiveSignatureCacheUnknown)
    return effectiveSignatureCacheUnknown
  }

  if (visiting.has(key)) {
    return hashVisualSignature({ cycle: key, own: component.visualSignature })
  }

  visiting.add(key)
  const dependencySignatures: Array<{ key: string; signature: string }> = []
  for (const dependencyCoordinate of component.dependencies ?? []) {
    const dependencyKey = graph.coordinateToKey.get(dependencyCoordinate) ?? graph.coordinateToKey.get(stripRunelightBaselinePathPrefix(dependencyCoordinate))
    if (!dependencyKey) continue

    const dependencySignature = runelightEffectiveVisualSignature(graph, dependencyKey, cache, visiting)
    if (dependencySignature === effectiveSignatureCacheUnknown) {
      cache.set(key, effectiveSignatureCacheUnknown)
      visiting.delete(key)
      return effectiveSignatureCacheUnknown
    }
    dependencySignatures.push({ key: dependencyKey, signature: dependencySignature })
  }
  visiting.delete(key)

  const signature = hashVisualSignature({
    dependencies: dependencySignatures.sort((left, right) => left.key.localeCompare(right.key)),
    own: component.visualSignature,
  })
  cache.set(key, signature)
  return signature
}

function runelightEffectiveVisualFrameSignature(
  graph: VisualGraph,
  key: string,
  frameName: string,
  cache: Map<string, string | typeof effectiveSignatureCacheUnknown>,
  visiting: Set<string>,
): string | typeof effectiveSignatureCacheUnknown {
  const cacheKey = `${key}:${frameName}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const component = graph.componentsByKey.get(key)
  const ownSignature = component?.frameVisualSignatures?.[frameName] ?? component?.visualSignature
  if (!component || !ownSignature) {
    cache.set(cacheKey, effectiveSignatureCacheUnknown)
    return effectiveSignatureCacheUnknown
  }

  if (visiting.has(cacheKey)) {
    return hashVisualSignature({ cycle: cacheKey, own: ownSignature })
  }

  visiting.add(cacheKey)
  const dependencySignatures: Array<{ key: string; signature: string }> = []
  const dependencyCoordinates = component.frameDependencies?.[frameName]
  if (!dependencyCoordinates) {
    cache.set(cacheKey, effectiveSignatureCacheUnknown)
    visiting.delete(cacheKey)
    return effectiveSignatureCacheUnknown
  }
  for (const dependencyCoordinate of dependencyCoordinates) {
    const dependencyKey = graph.coordinateToKey.get(dependencyCoordinate) ?? graph.coordinateToKey.get(stripRunelightBaselinePathPrefix(dependencyCoordinate))
    if (!dependencyKey) continue

    const dependencySignature = runelightEffectiveVisualSignature(graph, dependencyKey, new Map(), new Set())
    if (dependencySignature === effectiveSignatureCacheUnknown) {
      cache.set(cacheKey, effectiveSignatureCacheUnknown)
      visiting.delete(cacheKey)
      return effectiveSignatureCacheUnknown
    }
    dependencySignatures.push({ key: dependencyKey, signature: dependencySignature })
  }
  visiting.delete(cacheKey)

  const signature = hashVisualSignature({
    dependencies: dependencySignatures.sort((left, right) => left.key.localeCompare(right.key)),
    own: ownSignature,
  })
  cache.set(cacheKey, signature)
  return signature
}

function runelightVisualFrameChanges(input: {
  baselineComponent: RunelightVisualDiffComponent | undefined
  baselineFrameSignatures: Map<string, string | typeof effectiveSignatureCacheUnknown>
  baselineGraph: VisualGraph
  currentComponent: RunelightVisualDiffComponent | undefined
  currentFrameSignatures: Map<string, string | typeof effectiveSignatureCacheUnknown>
  currentGraph: VisualGraph
  key: string
}): RunelightWorkspaceVisualFrameChange[] {
  const currentFrameNames = new Set(input.currentComponent?.frames?.map((frame) => frame.name) ?? Object.keys(input.currentComponent?.frameVisualSignatures ?? {}))
  const baselineFrameNames = new Set(input.baselineComponent?.frames?.map((frame) => frame.name) ?? Object.keys(input.baselineComponent?.frameVisualSignatures ?? {}))
  const frameNames = [...new Set([...currentFrameNames, ...baselineFrameNames])].sort()

  return frameNames.map((name) => {
    if (!baselineFrameNames.has(name)) return { kind: "added", name }
    if (!currentFrameNames.has(name)) return { kind: "deleted", name }

    const currentSignature = runelightEffectiveVisualFrameSignature(input.currentGraph, input.key, name, input.currentFrameSignatures, new Set())
    const baselineSignature = runelightEffectiveVisualFrameSignature(input.baselineGraph, input.key, name, input.baselineFrameSignatures, new Set())
    if (currentSignature === effectiveSignatureCacheUnknown || baselineSignature === effectiveSignatureCacheUnknown) {
      return { kind: "unknown", name }
    }

    return { kind: currentSignature === baselineSignature ? "unchanged" : "changed", name }
  })
}

function hashVisualSignature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

/**
 * @internal Shared implementation detail for Runelight workspace change classification.
 */
export function stripRunelightBaselinePathPrefix(path: string, baselinePathPrefix?: string): string {
  if (!baselinePathPrefix) return path
  return path.startsWith(baselinePathPrefix) ? path.slice(baselinePathPrefix.length) : path
}

function parseGitStatusLine(line: string): RunelightWorkspaceFileStatus[] {
  if (!line.trim()) return []

  const status = line.slice(0, 2)
  const rawPath = line.slice(3)
  const path = normalizeGitStatusPath(rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath)
  const staged = status[0]
  const unstaged = status[1]

  if (status === "??" || staged === "A" || unstaged === "A") return [{ kind: "added", path }]
  if (staged === "D" || unstaged === "D") return [{ kind: "deleted", path }]
  return [{ kind: "modified", path }]
}

function normalizeGitStatusPath(path: string): string {
  const unquoted = path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path
  return unquoted.replaceAll("\\", "/")
}

function runelightBaselineSourceCacheKey(input: {
  baselineRoot: string
  cacheKeyParts?: Record<string, unknown>
  cwd: string
  pathspecs: readonly string[]
  runtimeImportSpecifier?: string
  sourceRoot: string
}): string {
  return JSON.stringify({
    ...input.cacheKeyParts,
    head: readGitHeadRevision(input.cwd),
    pathspecs: [...input.pathspecs],
    runtimeImportSpecifier: input.runtimeImportSpecifier,
    sourceRoot: input.sourceRoot,
  })
}

function readGitHeadRevision(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function readGitHeadFiles(cwd: string, pathspecs: readonly string[]): string[] {
  let output: string
  try {
    output = execFileSync("git", ["-C", cwd, "ls-tree", "-r", "--name-only", "HEAD", "--", ...pathspecs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return []
  }

  return output.split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/"))
}

function readGitHeadFile(cwd: string, path: string): Buffer | undefined {
  try {
    return execFileSync("git", ["-C", cwd, "show", `HEAD:${path}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    }) as Buffer
  } catch {
    return undefined
  }
}

function readTextFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function hashFileIfExists(cwd: string, path: string): string | undefined {
  try {
    return createHash("sha256").update(readFileSync(resolve(cwd, path))).digest("hex")
  } catch {
    return undefined
  }
}

function shouldRewriteBaselineSourceImports(path: string): boolean {
  return /\.(c|m)?(t|j)sx?$/.test(path)
}

function rewriteRunelightWorkspaceBaselineSourceImports(
  source: string,
  options: { baselineRoot: string; filePath: string; runtimeImportSpecifier?: string; sourceRoot: string },
): string {
  const aliasRewritten = source
    .replaceAll(/(from\s*["'])@\/([^"']+)(["'])/g, (_match, before: string, target: string, after: string) =>
      `${before}${runelightWorkspaceBaselineRelativeAliasSpecifier(options, target)}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@\/([^"']+)(["']\s*\))/g, (_match, before: string, target: string, after: string) =>
      `${before}${runelightWorkspaceBaselineRelativeAliasSpecifier(options, target)}${after}`)
  if (!options.runtimeImportSpecifier || !isRunelightBaselineProtocolFile(options.filePath)) return aliasRewritten

  return aliasRewritten
    .replaceAll(/(from\s*["'])@runelight\/core(["'])/g, (_match, before: string, after: string) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@runelight\/core(["']\s*\))/g, (_match, before: string, after: string) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
}

function runelightWorkspaceBaselineRelativeAliasSpecifier(
  options: { baselineRoot: string; filePath: string; sourceRoot: string },
  target: string,
): string {
  const fromDirectory = dirname(`${options.baselineRoot}/${options.filePath}`)
  const toPath = `${options.baselineRoot}/${options.sourceRoot}/${target}`.replaceAll("\\", "/")
  const relativePath = relative(fromDirectory, toPath).split(sep).join("/")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

function isRunelightBaselineProtocolFile(path: string): boolean {
  return path.endsWith(".g.tsx") || path.endsWith(".g.vue")
}
