import {
  G_PREVIEW_PROTOCOL_VERSION,
  createGPreviewRequestValuesMessage,
  type GPreviewRenderTarget,
  type GBoundaryRect,
  type GBoundaryTreeNode,
  type GRuntimeValuesSnapshot,
  type GPreviewProtocolMessage,
  type GPreviewRequestValuesMessage,
} from "gtsx"
import type { StudioManifest, StudioManifestComponent } from "./manifest"
import { previewFrameLayoutWidth } from "./preview-frame-layout"

export type StudioPreviewFrameState = {
  expectedSessionId: string
  ready: boolean
  tree?: GBoundaryTreeNode[]
  size?: {
    width: number
    height: number
  }
  error?: {
    message: string
    stack?: string
  }
  valuesByBoundaryId?: Record<string, GRuntimeValuesSnapshot>
}

export type StudioWorkspaceColumn = {
  components: StudioManifestComponent[]
  parentCoordinate?: string
}

export type StudioWorkspaceState = {
  canvasViewportPreset?: StudioViewportPreset
  columns: StudioWorkspaceColumn[]
  selectedCaseByCoordinate: Record<string, string>
  selectedCoordinatePath: string[]
  selectedRuntimeInstanceByCoordinate: Record<string, string>
  selectedViewportPresetByCoordinate: Record<string, StudioViewportPreset>
}

export type StudioCanvasTransform = {
  x: number
  y: number
  scale: number
}

export type StudioCanvasScreenRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export type StudioColumnLayout = {
  x: number
  y: number
}

export type StudioColumnLayoutMeasurement = {
  cardRectsByCoordinate: Record<string, StudioCanvasScreenRect>
  height: number
}

export type StudioCaseGridItemLayout = {
  height: number
  width: number
}

export type StudioCaseGridLayout = {
  caseChromeHeight: number
  cellHeight: number
  cellWidth: number
  columns: number
  gap: number
  height: number
  previewScale: number
  rows: number
  width: number
}

export type StudioCanvasWheelInput = {
  clientX: number
  clientY: number
  ctrlKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
  metaKey: boolean
  viewportLeft: number
  viewportTop: number
}

export type StudioCardSelectionSource = "keyboard" | "pointer"

export type StudioCardSelectionAction =
  | {
      type: "activate-card"
      coordinate: string
      source: StudioCardSelectionSource
    }
  | {
      type: "clear"
    }

export type StudioViewportPreset = "phone" | "tablet" | "desktop"

export type StudioComponentSelectionOptions = {
  columnIndex?: number
}

export type StudioRuntimeInstance = {
  boundaryId: string
  coordinate: string
  parentPath: string[]
  rect?: GBoundaryRect
}

export type StudioRuntimeValuesRequest = {
  sessionId: string
  message: GPreviewRequestValuesMessage
}

export type StudioPreviewCacheEntry = {
  frameState: StudioPreviewFrameState
  lastUsedAt: number
}

export type StudioPreviewWarmupTarget = {
  cacheKey: string
  previewUrl: string
  sessionId: string
  size: { width: number; height: number }
  title: string
}

export type StudioWorkspaceUrlState = {
  canvas: StudioCanvasTransform
  selection: string
  workspace: StudioWorkspaceState
  warning?: string
}

const studioRootSelectionId = "roots"

export function applyStudioPreviewMessage(
  state: StudioPreviewFrameState,
  message: GPreviewProtocolMessage,
): StudioPreviewFrameState {
  if (message.protocolVersion !== G_PREVIEW_PROTOCOL_VERSION || message.sessionId !== state.expectedSessionId) {
    return state
  }

  if (message.type === "gtsx:ready") {
    const next = { ...state, ready: true }
    delete next.error
    return next
  }

  if (message.type === "gtsx:tree") {
    return { ...state, tree: message.tree }
  }

  if (message.type === "gtsx:resize") {
    return { ...state, size: message.size }
  }

  if (message.type === "gtsx:error") {
    return { ...state, error: message.error }
  }

  if (message.type === "gtsx:values") {
    return {
      ...state,
      valuesByBoundaryId: {
        ...state.valuesByBoundaryId,
        [message.values.boundaryId]: message.values,
      },
    }
  }

  return state
}

export function applyStudioPreviewMessageToFrameStates(
  frameStates: Record<string, StudioPreviewFrameState>,
  message: GPreviewProtocolMessage,
  activeSessionIds: Set<string>,
): Record<string, StudioPreviewFrameState> {
  if (!activeSessionIds.has(message.sessionId)) return frameStates

  const currentFrameState = frameStates[message.sessionId] ?? {
    expectedSessionId: message.sessionId,
    ready: false,
  }

  return {
    ...frameStates,
    [message.sessionId]: applyStudioPreviewMessage(currentFrameState, message),
  }
}

export function createStudioWorkspaceState(manifest: StudioManifest, selection?: string): StudioWorkspaceState {
  const selected = resolveStudioSelection(manifest, selection)
  return {
    canvasViewportPreset: "tablet",
    columns: [{ components: selected.components }],
    selectedCaseByCoordinate: {},
    selectedCoordinatePath: [],
    selectedRuntimeInstanceByCoordinate: {},
    selectedViewportPresetByCoordinate: {},
  }
}

export function defaultStudioCanvasTransform(): StudioCanvasTransform {
  return { x: 40, y: 40, scale: 1 }
}

export function selectStudioComponent(
  state: StudioWorkspaceState,
  manifest: StudioManifest,
  coordinate: string,
  tree: GBoundaryTreeNode[] | GBoundaryTreeNode[][],
  options: StudioComponentSelectionOptions = {},
): StudioWorkspaceState {
  const selectedColumnIndex = studioSelectedColumnIndexForCoordinate(state, coordinate, options.columnIndex)
  if (selectedColumnIndex < 0) return state

  const nextColumns = state.columns.slice(0, selectedColumnIndex + 1)
  const selectedPath = [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate]
  const childComponents = directChildComponentsForCoordinate(manifest, normalizeStudioBoundaryTrees(tree), coordinate)
  if (childComponents.length > 0) {
    nextColumns.push({ components: childComponents, parentCoordinate: coordinate })
  }

  return {
    canvasViewportPreset: canvasViewportPresetForWorkspace(state),
    columns: nextColumns,
    selectedCaseByCoordinate: omitStudioSelectedCases(state.selectedCaseByCoordinate, selectedPath),
    selectedCoordinatePath: selectedPath,
    selectedRuntimeInstanceByCoordinate: state.selectedRuntimeInstanceByCoordinate,
    selectedViewportPresetByCoordinate: state.selectedViewportPresetByCoordinate,
  }
}

function studioSelectedColumnIndexForCoordinate(
  state: StudioWorkspaceState,
  coordinate: string,
  preferredColumnIndex: number | undefined,
): number {
  if (
    preferredColumnIndex !== undefined &&
    state.columns[preferredColumnIndex]?.components.some((component) => component.coordinate === coordinate)
  ) {
    return preferredColumnIndex
  }

  return state.columns.findIndex((column) => column.components.some((component) => component.coordinate === coordinate))
}

export function selectedStudioCaseName(
  state: Pick<StudioWorkspaceState, "selectedCaseByCoordinate">,
  component: StudioManifestComponent,
): string {
  return state.selectedCaseByCoordinate[component.coordinate] ?? component.cases[0]?.name ?? "No cases"
}

export function changeStudioComponentCase(
  state: StudioWorkspaceState,
  coordinate: string,
  caseName: string,
  options: { keepDrilldown?: boolean } = {},
): StudioWorkspaceState {
  const selectedColumnIndex = state.columns.findIndex((column) =>
    column.components.some((component) => component.coordinate === coordinate),
  )
  const columns = options.keepDrilldown || selectedColumnIndex < 0 ? state.columns : state.columns.slice(0, selectedColumnIndex + 1)

  return {
    canvasViewportPreset: canvasViewportPresetForWorkspace(state),
    columns,
    selectedCaseByCoordinate: {
      ...state.selectedCaseByCoordinate,
      [coordinate]: caseName,
    },
    selectedCoordinatePath:
      options.keepDrilldown || selectedColumnIndex < 0
        ? state.selectedCoordinatePath
        : [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate],
    selectedRuntimeInstanceByCoordinate: {},
    selectedViewportPresetByCoordinate: state.selectedViewportPresetByCoordinate,
  }
}

export function selectStudioRuntimeInstance(
  state: StudioWorkspaceState,
  coordinate: string,
  boundaryId: string,
): StudioWorkspaceState {
  return {
    ...state,
    selectedRuntimeInstanceByCoordinate: {
      ...state.selectedRuntimeInstanceByCoordinate,
      [coordinate]: boundaryId,
    },
  }
}

export function changeStudioViewportPreset(
  state: StudioWorkspaceState,
  coordinate: string,
  preset: StudioViewportPreset,
): StudioWorkspaceState {
  return {
    ...state,
    canvasViewportPreset: preset,
    selectedViewportPresetByCoordinate: {
      ...state.selectedViewportPresetByCoordinate,
      [coordinate]: preset,
    },
  }
}

export function changeStudioCanvasViewportPreset(
  state: StudioWorkspaceState,
  preset: StudioViewportPreset,
): StudioWorkspaceState {
  return {
    ...state,
    canvasViewportPreset: preset,
    selectedViewportPresetByCoordinate: {},
  }
}

export function createStudioWorkspaceUrlSearchParams(
  selection: string | undefined,
  workspace: StudioWorkspaceState,
  canvas?: StudioCanvasTransform,
): URLSearchParams {
  const params = new URLSearchParams()
  if (selection && selection !== studioRootSelectionId) params.set("selection", selection)
  const canvasViewportPreset = canvasViewportPresetForWorkspace(workspace)
  if (canvasViewportPreset !== "tablet") params.set("canvasViewport", canvasViewportPreset)
  setStudioCanvasTransformUrlParams(params, canvas)

  for (const coordinate of workspace.selectedCoordinatePath) {
    params.append("path", coordinate)
  }

  for (const coordinate of workspace.selectedCoordinatePath) {
    const caseName = workspace.selectedCaseByCoordinate[coordinate]
    if (caseName) params.append("case", `${coordinate}:${caseName}`)

    const boundaryId = workspace.selectedRuntimeInstanceByCoordinate[coordinate]
    if (boundaryId) params.append("instance", `${coordinate}:${boundaryId}`)

    const viewport = workspace.selectedViewportPresetByCoordinate[coordinate]
    if (viewport !== undefined) params.append("viewport", `${coordinate}:${viewport}`)
  }

  return params
}

export function createStudioWorkspaceStateFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
): StudioWorkspaceUrlState {
  const selection = params.get("selection") ?? undefined
  const canvas = createStudioCanvasTransformFromUrl(params)
  const resolvedSelection = resolveStudioSelection(manifest, selection)
  const rawPath = params.getAll("path")
  const selectedCoordinatePath = rawPath.filter((coordinate) => Boolean(findManifestComponent(manifest, coordinate)))
  const pathCoordinates = new Set(selectedCoordinatePath)
  const selectedCaseByCoordinate = selectedCasesFromUrl(manifest, params, pathCoordinates)
  const selectedRuntimeInstanceByCoordinate = selectedRuntimeInstancesFromUrl(manifest, params, pathCoordinates)
  const selectedViewportPresetByCoordinate = selectedViewportPresetsFromUrl(manifest, params, pathCoordinates)
  const canvasViewportPreset = canvasViewportPresetFromUrl(params, selectedViewportPresetByCoordinate, selectedCoordinatePath)
  const hasInvalidUrlState =
    Boolean(selection && selection !== resolvedSelection.id) ||
    rawPath.length !== selectedCoordinatePath.length ||
    hasInvalidSelectedCase(manifest, params, pathCoordinates) ||
    hasInvalidSelectedRuntimeInstance(manifest, params, pathCoordinates) ||
    hasInvalidCanvasViewportPreset(params)
  const warning = hasInvalidUrlState ? "Invalid Studio URL state was ignored." : undefined

  if (selectedCoordinatePath.length === 0) {
    return {
      canvas,
      selection: resolvedSelection.id,
      workspace: {
        canvasViewportPreset,
        columns: [{ components: resolvedSelection.components }],
        selectedCaseByCoordinate,
        selectedCoordinatePath: [],
        selectedRuntimeInstanceByCoordinate,
        selectedViewportPresetByCoordinate,
      },
      ...(warning ? { warning } : {}),
    }
  }

  return {
    canvas,
    selection: resolvedSelection.id,
    workspace: {
      canvasViewportPreset,
      columns: [
        { components: resolvedSelection.components },
        ...selectedCoordinatePath.slice(1).map((coordinate) => {
          const component = findManifestComponent(manifest, coordinate)
          const columnIndex = selectedCoordinatePath.indexOf(coordinate)
          return {
            components: component ? [component] : [],
            parentCoordinate: columnIndex > 0 ? selectedCoordinatePath[columnIndex - 1] : undefined,
          }
        }),
      ],
      selectedCaseByCoordinate,
      selectedCoordinatePath,
      selectedRuntimeInstanceByCoordinate,
      selectedViewportPresetByCoordinate,
    },
    ...(warning ? { warning } : {}),
  }
}

export function createStudioRuntimeValuesRequest(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
  boundaryId: string,
): StudioRuntimeValuesRequest | undefined {
  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (!selectedCoordinate) return undefined

  const sourceCoordinate = workspace.selectedCoordinatePath.at(-2) ?? selectedCoordinate
  const sourceComponent = findManifestComponent(manifest, sourceCoordinate)
  if (!sourceComponent) return undefined

  const sourceCaseName = selectedStudioCaseName(workspace, sourceComponent)
  const sessionId = previewSessionId(sourceComponent, sourceCaseName, canvasViewportPresetForWorkspace(workspace))
  return {
    sessionId,
    message: createGPreviewRequestValuesMessage(sessionId, boundaryId),
  }
}

function selectedCasesFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, string> {
  const selectedCases: Record<string, string> = {}
  for (const value of params.getAll("case")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (!parsed) continue

    const component = findManifestComponent(manifest, parsed.coordinate)
    if (pathCoordinates.has(parsed.coordinate) && component?.cases.some((testCase) => testCase.name === parsed.value)) {
      selectedCases[parsed.coordinate] = parsed.value
    }
  }
  return selectedCases
}

function selectedRuntimeInstancesFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, string> {
  const selectedInstances: Record<string, string> = {}
  for (const value of params.getAll("instance")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (parsed && pathCoordinates.has(parsed.coordinate) && findManifestComponent(manifest, parsed.coordinate)) {
      selectedInstances[parsed.coordinate] = parsed.value
    }
  }
  return selectedInstances
}

function selectedViewportPresetsFromUrl(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): Record<string, StudioViewportPreset> {
  const selectedPresets: Record<string, StudioViewportPreset> = {}
  for (const value of params.getAll("viewport")) {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (parsed && pathCoordinates.has(parsed.coordinate) && isStudioViewportPreset(parsed.value)) {
      selectedPresets[parsed.coordinate] = parsed.value
    }
  }
  return selectedPresets
}

function canvasViewportPresetFromUrl(
  params: URLSearchParams,
  selectedViewportPresetByCoordinate: Record<string, StudioViewportPreset>,
  selectedCoordinatePath: string[],
): StudioViewportPreset {
  const value = params.get("canvasViewport")
  if (value && isStudioViewportPreset(value)) return value

  const legacyCoordinate = [...selectedCoordinatePath].reverse().find((coordinate) => selectedViewportPresetByCoordinate[coordinate])
  return legacyCoordinate ? selectedViewportPresetByCoordinate[legacyCoordinate]! : "tablet"
}

function isStudioViewportPreset(value: string): value is StudioViewportPreset {
  return value === "phone" || value === "tablet" || value === "desktop"
}

function hasInvalidCanvasViewportPreset(params: URLSearchParams): boolean {
  const value = params.get("canvasViewport")
  return Boolean(value && !isStudioViewportPreset(value))
}

function hasInvalidSelectedCase(manifest: StudioManifest, params: URLSearchParams, pathCoordinates: Set<string>): boolean {
  return params.getAll("case").some((value) => {
    const parsed = parseCoordinateValuePair(manifest, value)
    if (!parsed || !pathCoordinates.has(parsed.coordinate)) return true

    const component = findManifestComponent(manifest, parsed.coordinate)
    return !component?.cases.some((testCase) => testCase.name === parsed.value)
  })
}

function hasInvalidSelectedRuntimeInstance(
  manifest: StudioManifest,
  params: URLSearchParams,
  pathCoordinates: Set<string>,
): boolean {
  return params.getAll("instance").some((value) => {
    const parsed = parseCoordinateValuePair(manifest, value)
    return !parsed || !pathCoordinates.has(parsed.coordinate)
  })
}

function parseCoordinateValuePair(manifest: StudioManifest, value: string): { coordinate: string; value: string } | undefined {
  const coordinate = manifest.files
    .flatMap((file) => file.components)
    .map((component) => component.coordinate)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => value.startsWith(`${candidate}:`))
  if (!coordinate) return undefined

  return {
    coordinate,
    value: value.slice(coordinate.length + 1),
  }
}

function directChildComponentsForCoordinate(
  manifest: StudioManifest,
  trees: GBoundaryTreeNode[][],
  coordinate: string,
): StudioManifestComponent[] {
  const componentsByCoordinate = new Map(
    manifest.files.flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []

  for (const tree of trees) {
    const node = findBoundaryNode(tree, coordinate)
    if (!node) continue

    for (const child of node.children) {
      if (seen.has(child.coordinate)) continue

      const component = componentsByCoordinate.get(child.coordinate)
      if (component) {
        seen.add(child.coordinate)
        components.push(component)
      }
    }
  }

  return components
}

function normalizeStudioBoundaryTrees(tree: GBoundaryTreeNode[] | GBoundaryTreeNode[][]): GBoundaryTreeNode[][] {
  if (tree.length === 0) return []
  return Array.isArray(tree[0]) ? (tree as GBoundaryTreeNode[][]) : [tree as GBoundaryTreeNode[]]
}

function omitStudioSelectedCases(
  selectedCaseByCoordinate: Record<string, string>,
  coordinates: string[],
): Record<string, string> {
  const omitted = new Set(coordinates)
  const next = Object.fromEntries(Object.entries(selectedCaseByCoordinate).filter(([coordinate]) => !omitted.has(coordinate)))
  return next
}

function findBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}

export function initialStudioUrlSearchParams(selection: string | undefined, urlSearch: string | undefined): URLSearchParams {
  if (urlSearch !== undefined) return new URLSearchParams(urlSearch)
  if (typeof window !== "undefined" && window.location.search) {
    return new URLSearchParams(window.location.search)
  }

  const params = new URLSearchParams()
  if (selection) params.set("selection", selection)
  return params
}

export function createStudioCanvasTransformFromUrl(params: URLSearchParams): StudioCanvasTransform {
  const fallback = defaultStudioCanvasTransform()
  return {
    x: numberUrlParam(params, "canvasX", fallback.x),
    y: numberUrlParam(params, "canvasY", fallback.y),
    scale: clamp(numberUrlParam(params, "canvasScale", fallback.scale), studioCanvasMinScale, studioCanvasMaxScale),
  }
}

export function replaceStudioCanvasUrlState(canvas: StudioCanvasTransform) {
  if (typeof window === "undefined") return

  const params = new URLSearchParams(window.location.search)
  setStudioCanvasTransformUrlParams(params, canvas)
  const search = params.toString()
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (nextUrl !== currentUrl) {
    window.history.replaceState({ gtsxStudio: true }, "", nextUrl)
  }
}

export function pushStudioWorkspaceUrlState(
  selection: string | undefined,
  workspace: StudioWorkspaceState,
  options: { canvas?: StudioCanvasTransform } = {},
) {
  if (typeof window === "undefined") return

  const canvas = options.canvas ?? createStudioCanvasTransformFromUrl(new URLSearchParams(window.location.search))
  const params = createStudioWorkspaceUrlSearchParams(selection, workspace, canvas)
  preserveStudioDebugUrlParams(params, new URLSearchParams(window.location.search))
  const search = params.toString()
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (nextUrl !== currentUrl) {
    window.history.pushState({ gtsxStudio: true }, "", nextUrl)
  }
}

export function isStudioPreviewPoolDebugEnabled(params: URLSearchParams): boolean {
  const debugModes = studioDebugModes(params)
  return (
    debugModes.includes("pool") ||
    debugModes.includes("preview-pool") ||
    debugModes.includes("no-pool") ||
    debugModes.includes("disable-pool") ||
    params.get("debugPool") === "1" ||
    isStudioPreviewPoolDisabled(params)
  )
}

export function isStudioPreviewPoolDisabled(params: URLSearchParams): boolean {
  const debugModes = studioDebugModes(params)
  const debugPool = params.get("debugPool")?.trim().toLowerCase()
  return (
    debugModes.includes("no-pool") ||
    debugModes.includes("disable-pool") ||
    debugModes.includes("without-pool") ||
    debugPool === "0" ||
    debugPool === "false" ||
    debugPool === "off"
  )
}

function studioDebugModes(params: URLSearchParams): string[] {
  return params
    .getAll("debug")
    .join(",")
    .split(",")
    .map((mode) => mode.trim())
    .filter(Boolean)
}

function preserveStudioDebugUrlParams(target: URLSearchParams, source: URLSearchParams) {
  for (const name of ["debug", "debugPool", "previewQueueActive", "previewQueueLength", "queueActive", "queueLength"]) {
    target.delete(name)
    for (const value of source.getAll(name)) target.append(name, value)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const studioCanvasMinScale = 0.2
const studioCanvasMaxScale = 2.5

function setStudioCanvasTransformUrlParams(params: URLSearchParams, canvas: StudioCanvasTransform | undefined) {
  params.delete("canvasX")
  params.delete("canvasY")
  params.delete("canvasScale")
  if (!canvas) return

  const fallback = defaultStudioCanvasTransform()
  if (canvas.x !== fallback.x) params.set("canvasX", formatStudioCanvasNumber(canvas.x))
  if (canvas.y !== fallback.y) params.set("canvasY", formatStudioCanvasNumber(canvas.y))
  if (canvas.scale !== fallback.scale) params.set("canvasScale", formatStudioCanvasNumber(canvas.scale))
}

function numberUrlParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = params.get(name)
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatStudioCanvasNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export function applyStudioCanvasWheel(current: StudioCanvasTransform, input: StudioCanvasWheelInput): StudioCanvasTransform {
  if (!input.ctrlKey && !input.metaKey) {
    return {
      ...current,
      x: current.x - input.deltaX,
      y: current.y - input.deltaY,
    }
  }

  const viewportX = input.clientX - input.viewportLeft
  const viewportY = input.clientY - input.viewportTop
  const focalCanvasX = (viewportX - current.x) / current.scale
  const focalCanvasY = (viewportY - current.y) / current.scale
  const wheelDelta = -input.deltaY * wheelDeltaModeMultiplier(input.deltaMode) * 10
  const nextScale = clamp(current.scale * 2 ** wheelDelta, studioCanvasMinScale, studioCanvasMaxScale)

  return {
    scale: nextScale,
    x: viewportX - focalCanvasX * nextScale,
    y: viewportY - focalCanvasY * nextScale,
  }
}

export function revealStudioCanvasRect(
  current: StudioCanvasTransform,
  input: {
    blockerRects?: StudioCanvasScreenRect[]
    margin?: number
    rect: StudioCanvasScreenRect
    viewportRect: StudioCanvasScreenRect
  },
): StudioCanvasTransform {
  const margin = input.margin ?? 24
  const visibleRect = visibleStudioCanvasRect(input.viewportRect, input.blockerRects ?? [], margin)
  const deltaX = revealIntervalDelta(input.rect.left, input.rect.right, visibleRect.left, visibleRect.right)
  const deltaY = revealIntervalDelta(input.rect.top, input.rect.bottom, visibleRect.top, visibleRect.bottom)

  if (deltaX === 0 && deltaY === 0) return current
  return {
    ...current,
    x: current.x + deltaX,
    y: current.y + deltaY,
  }
}

export function computeStudioColumnLayout(input: {
  columns: { componentCoordinates: string[]; parentCoordinate?: string }[]
  margin?: number
  measurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
}): Record<number, StudioColumnLayout> {
  const margin = input.margin ?? 40
  const layoutsByIndex: Record<number, StudioColumnLayout> = {}
  const absoluteCardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>> = {}

  input.columns.forEach((column, columnIndex) => {
    if (columnIndex === 0 || !column.parentCoordinate) {
      layoutsByIndex[columnIndex] = { x: 0, y: 0 }
    } else {
      const parentRect = findPreviousColumnCardRect(absoluteCardRectsByIndex, columnIndex, column.parentCoordinate)
      if (!parentRect) {
        layoutsByIndex[columnIndex] = { x: columnIndex * margin, y: 0 }
      } else {
        const columnHeight = input.measurementsByIndex[columnIndex]?.height ?? 0
        const bandTop = parentRect.top
        const bandBottom = bandTop + columnHeight
        const rightEdge = rightmostCardEdgeInBand(absoluteCardRectsByIndex, columnIndex, bandTop, bandBottom) ?? parentRect.right
        layoutsByIndex[columnIndex] = {
          x: rightEdge + margin,
          y: parentRect.top,
        }
      }
    }

    absoluteCardRectsByIndex[columnIndex] = absoluteColumnCardRects(
      input.measurementsByIndex[columnIndex]?.cardRectsByCoordinate ?? {},
      layoutsByIndex[columnIndex] ?? { x: 0, y: 0 },
      column.componentCoordinates,
    )
  })

  return layoutsByIndex
}

export function computeStudioCaseGridLayout(input: {
  caseChromeHeight?: number
  gap?: number
  items: StudioCaseGridItemLayout[]
  maxSide?: number
  minScale?: number
  previewScale?: number
}): StudioCaseGridLayout {
  const gap = input.gap ?? 14
  const caseChromeHeight = input.caseChromeHeight ?? 20
  const maxSide = input.maxSide ?? 760
  const minScale = input.minScale ?? 0.24
  const items = input.items.length > 0 ? input.items : [{ height: 160, width: 280 }]
  const itemCount = items.length
  const maxItemWidth = Math.max(1, ...items.map((item) => item.width))
  const maxItemHeight = Math.max(1, ...items.map((item) => item.height))
  let bestLayout: StudioCaseGridLayout | undefined
  let bestScore = Number.POSITIVE_INFINITY

  for (let columns = 1; columns <= itemCount; columns += 1) {
    const rows = Math.ceil(itemCount / columns)
    const naturalWidth = columns * maxItemWidth + (columns - 1) * gap
    const previewNaturalHeight = rows * maxItemHeight
    const chromeHeight = rows * caseChromeHeight + (rows - 1) * gap
    const heightAvailableForPreviews = Math.max(maxSide * minScale, maxSide - chromeHeight)
    const fittingPreviewScale = clamp(
      Math.min(1, maxSide / naturalWidth, heightAvailableForPreviews / previewNaturalHeight),
      minScale,
      1,
    )
    const previewScale = input.previewScale === undefined ? fittingPreviewScale : clamp(input.previewScale, minScale, 1)
    const cellWidth = Math.ceil(maxItemWidth * previewScale)
    const cellHeight = Math.ceil(caseChromeHeight + maxItemHeight * previewScale)
    const width = Math.ceil(columns * cellWidth + (columns - 1) * gap)
    const height = Math.ceil(rows * cellHeight + (rows - 1) * gap)
    const aspectPenalty = Math.abs(Math.log(width / height))
    const scalePenalty = input.previewScale === undefined ? (1 - previewScale) * 0.35 : 0
    const emptySlotPenalty = (columns * rows - itemCount) * 0.08
    const overflowPenalty = input.previewScale === undefined ? 0 : Math.max(0, width - maxSide, height - maxSide) / maxSide
    const score = aspectPenalty + scalePenalty + emptySlotPenalty + overflowPenalty * 4

    if (score < bestScore) {
      bestScore = score
      bestLayout = {
        caseChromeHeight,
        cellHeight,
        cellWidth,
        columns,
        gap,
        height,
        previewScale,
        rows,
        width,
      }
    }
  }

  return (
    bestLayout ?? {
      caseChromeHeight,
      cellHeight: caseChromeHeight + 160,
      cellWidth: 280,
      columns: 1,
      gap,
      height: caseChromeHeight + 160,
      previewScale: 1,
      rows: 1,
      width: 280,
    }
  )
}

export function applyStudioCardSelectionAction(
  current: string | undefined,
  action: StudioCardSelectionAction,
): string | undefined {
  if (action.type === "clear") return undefined
  if (action.source === "keyboard") return undefined
  if (action.coordinate === current) return current
  return action.coordinate
}

function wheelDeltaModeMultiplier(deltaMode: number): number {
  if (deltaMode === 1) return 0.05
  if (deltaMode === 2) return 1
  return 0.002
}

function visibleStudioCanvasRect(
  viewportRect: StudioCanvasScreenRect,
  blockerRects: StudioCanvasScreenRect[],
  margin: number,
): StudioCanvasScreenRect {
  let left = viewportRect.left + margin
  let right = viewportRect.right - margin
  let top = viewportRect.top + margin
  let bottom = viewportRect.bottom - margin

  for (const blockerRect of blockerRects) {
    const overlapsVertically = blockerRect.bottom > top && blockerRect.top < bottom
    const overlapsHorizontally = blockerRect.right > left && blockerRect.left < right
    if (!overlapsVertically || !overlapsHorizontally) continue

    const touchesRightEdge = blockerRect.right >= viewportRect.right - 1
    const touchesLeftEdge = blockerRect.left <= viewportRect.left + 1
    const touchesBottomEdge = blockerRect.bottom >= viewportRect.bottom - 1
    const touchesTopEdge = blockerRect.top <= viewportRect.top + 1

    if (touchesRightEdge || touchesLeftEdge) {
      if (touchesRightEdge) right = Math.min(right, blockerRect.left - margin)
      if (touchesLeftEdge) left = Math.max(left, blockerRect.right + margin)
      continue
    }

    if (touchesBottomEdge) bottom = Math.min(bottom, blockerRect.top - margin)
    if (touchesTopEdge) top = Math.max(top, blockerRect.bottom + margin)
  }

  return { bottom: Math.max(top, bottom), left, right: Math.max(left, right), top }
}

function revealIntervalDelta(rectStart: number, rectEnd: number, visibleStart: number, visibleEnd: number): number {
  const rectSize = rectEnd - rectStart
  const visibleSize = visibleEnd - visibleStart

  if (rectSize > visibleSize) {
    if (rectEnd < visibleStart) return visibleStart - rectStart
    if (rectStart > visibleEnd) return visibleEnd - rectEnd
    return 0
  }

  if (rectStart < visibleStart) return visibleStart - rectStart
  if (rectEnd > visibleEnd) return visibleEnd - rectEnd
  return 0
}

function absoluteColumnCardRects(
  cardRectsByCoordinate: Record<string, StudioCanvasScreenRect>,
  layout: StudioColumnLayout,
  componentCoordinates: string[],
): Record<string, StudioCanvasScreenRect> {
  const absoluteRects: Record<string, StudioCanvasScreenRect> = {}

  for (const coordinate of componentCoordinates) {
    const rect = cardRectsByCoordinate[coordinate]
    if (!rect) continue
    absoluteRects[coordinate] = {
      bottom: rect.bottom + layout.y,
      left: rect.left + layout.x,
      right: rect.right + layout.x,
      top: rect.top + layout.y,
    }
  }

  return absoluteRects
}

function findPreviousColumnCardRect(
  cardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>>,
  beforeColumnIndex: number,
  coordinate: string,
): StudioCanvasScreenRect | undefined {
  for (let columnIndex = beforeColumnIndex - 1; columnIndex >= 0; columnIndex -= 1) {
    const rect = cardRectsByIndex[columnIndex]?.[coordinate]
    if (rect) return rect
  }
  return undefined
}

function rightmostCardEdgeInBand(
  cardRectsByIndex: Record<number, Record<string, StudioCanvasScreenRect>>,
  beforeColumnIndex: number,
  bandTop: number,
  bandBottom: number,
): number | undefined {
  let rightEdge: number | undefined

  for (let columnIndex = 0; columnIndex < beforeColumnIndex; columnIndex += 1) {
    for (const rect of Object.values(cardRectsByIndex[columnIndex] ?? {})) {
      if (rect.bottom <= bandTop || rect.top >= bandBottom) continue
      rightEdge = rightEdge === undefined ? rect.right : Math.max(rightEdge, rect.right)
    }
  }

  return rightEdge
}

export function componentCardLayoutWidth(
  displaySize: { width: number | string },
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): number {
  const rect = tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
  if (rect) return Math.max(280, Math.ceil(Number(previewFrameLayoutWidth(displaySize, rect))))
  return typeof displaySize.width === "number" ? displaySize.width + 28 : 520
}

export function clipPreviewBoundaryRectToViewport(
  rect: GBoundaryRect | undefined,
  viewport: { width: number | string; height: number },
): GBoundaryRect | undefined {
  if (!rect) return undefined

  const viewportWidth = typeof viewport.width === "number" ? viewport.width : Number.POSITIVE_INFINITY
  const left = clamp(rect.x, 0, viewportWidth)
  const top = clamp(rect.y, 0, viewport.height)
  const right = clamp(rect.x + rect.width, 0, viewportWidth)
  const bottom = clamp(rect.y + rect.height, 0, viewport.height)

  if (right <= left || bottom <= top) return undefined

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function canvasViewportPresetForWorkspace(workspace: StudioWorkspaceState): StudioViewportPreset {
  if (workspace.canvasViewportPreset) return workspace.canvasViewportPreset

  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (selectedCoordinate) return workspace.selectedViewportPresetByCoordinate[selectedCoordinate] ?? "tablet"
  return Object.values(workspace.selectedViewportPresetByCoordinate)[0] ?? "tablet"
}

export function visibleWorkspaceComponents(workspace: StudioWorkspaceState): StudioManifestComponent[] {
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []
  for (const component of workspace.columns.flatMap((column) => column.components)) {
    if (seen.has(component.coordinate)) continue
    seen.add(component.coordinate)
    components.push(component)
  }
  return components
}

export function findManifestComponent(manifest: StudioManifest, coordinate: string): StudioManifestComponent | undefined {
  return manifest.files.flatMap((file) => file.components).find((component) => component.coordinate === coordinate)
}

export function createStudioPreviewUrl(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  caseName: string,
  sessionId = previewSessionId(component, caseName),
  options: { static?: boolean } = {},
): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId,
  })
  if (options.static) params.set("static", "1")
  return `${manifest.routes.preview}?${params.toString()}`
}

export function createStudioPreviewPoolUrl(manifest: StudioManifest): string {
  return appendStudioPreviewSearchParams(manifest.routes.preview, new URLSearchParams({ chrome: "0", pool: "1" }))
}

export function studioPreviewRenderTargetFromUrl(previewUrl: string, fallbackSessionId: string): GPreviewRenderTarget {
  const url = new URL(previewUrl, "http://gtsx.local")
  const caseOverrides = url.searchParams.getAll("gcase").flatMap((value) => {
    const separatorIndex = value.lastIndexOf(":")
    return separatorIndex > 0 ? ([[value.slice(0, separatorIndex), value.slice(separatorIndex + 1)]] as [string, string][]) : []
  })

  return {
    caseName: url.searchParams.get("case"),
    ...(caseOverrides.length > 0 ? { caseOverrides } : {}),
    chrome: url.searchParams.get("chrome"),
    entry: url.searchParams.get("entry"),
    sessionId: url.searchParams.get("sessionId") ?? fallbackSessionId,
    staticMode: url.searchParams.get("static") === "1",
  }
}

function appendStudioPreviewSearchParams(url: string, params: URLSearchParams): string {
  const serialized = params.toString()
  if (!serialized) return url
  return `${url}${url.includes("?") ? "&" : "?"}${serialized}`
}

export function previewSessionId(
  component: StudioManifestComponent,
  caseName: string,
  viewportPreset?: StudioViewportPreset,
): string {
  return `${component.coordinate}:${caseName}${viewportPreset && viewportPreset !== "tablet" ? `@${viewportPreset}` : ""}`
}

export function studioPreviewCacheKey(component: StudioManifestComponent, caseName: string, viewportPreset: StudioViewportPreset): string {
  return `${viewportPreset}\n${component.sourceHash ?? "no-source-hash"}\n${component.coordinate}\n${caseName}`
}

export function studioPreviewFrameSize(
  preset: StudioViewportPreset,
  reportedSize: { width: number; height: number } | undefined,
): { width: number | string; height: number } {
  if (preset === "phone") return { width: 390, height: 844 }
  if (preset === "tablet") return { width: 768, height: 1024 }
  if (preset === "desktop") return { width: 1280, height: 900 }
  return { width: 768, height: clamp(reportedSize?.height ?? 1024, 160, 1200) }
}

export function mergeStudioPreviewFrameState(
  sessionId: string,
  current: StudioPreviewFrameState | undefined,
  cached: StudioPreviewFrameState | undefined,
): StudioPreviewFrameState | undefined {
  if (!current && !cached) return undefined

  return {
    expectedSessionId: sessionId,
    ready: current?.ready ?? false,
    ...(current?.tree ?? cached?.tree ? { tree: current?.tree ?? cached?.tree } : {}),
    ...(current?.size ?? cached?.size ? { size: current?.size ?? cached?.size } : {}),
    ...(current?.error ? { error: current.error } : {}),
    ...(current?.valuesByBoundaryId ? { valuesByBoundaryId: current.valuesByBoundaryId } : {}),
  }
}

export function currentPreviewSessionIds(workspace: StudioWorkspaceState): Set<string> {
  const viewportPreset = canvasViewportPresetForWorkspace(workspace)
  return new Set(
    workspace.columns.flatMap((column) =>
      column.components.flatMap((component) =>
        component.cases.map((testCase) => previewSessionId(component, testCase.name, viewportPreset)),
      ),
    ),
  )
}

export function currentStudioPreviewTargets(manifest: StudioManifest, workspace: StudioWorkspaceState): StudioPreviewWarmupTarget[] {
  const viewportPreset = canvasViewportPresetForWorkspace(workspace)
  return visibleWorkspaceComponents(workspace).flatMap((component) =>
    component.cases.map((testCase) =>
      studioPreviewTarget(manifest, component, testCase.name, viewportPreset, previewSessionId(component, testCase.name, viewportPreset)),
    ),
  )
}

export function studioPreviewWarmupTargets(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
  options: { limit?: number } = {},
): StudioPreviewWarmupTarget[] {
  const viewportPreset = canvasViewportPresetForWorkspace(workspace)
  const activeCacheKeys = new Set(currentStudioPreviewTargets(manifest, workspace).map((target) => target.cacheKey))
  const targets = new Map<string, StudioPreviewWarmupTarget>()
  const limit = options.limit ?? 16

  const addTarget = (component: StudioManifestComponent | undefined, caseName: string | undefined) => {
    if (!component || !caseName || caseName === "No cases") return
    const cacheKey = studioPreviewCacheKey(component, caseName, viewportPreset)
    if (activeCacheKeys.has(cacheKey) || targets.has(cacheKey)) return
    targets.set(cacheKey, studioPreviewTarget(manifest, component, caseName, viewportPreset, warmupPreviewSessionId(cacheKey)))
  }

  const componentsByCoordinate = new Map(
    manifest.files.flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )

  for (const coordinate of workspace.selectedCoordinatePath) {
    const component = componentsByCoordinate.get(coordinate)
    for (const testCase of component?.cases ?? []) addTarget(component, testCase.name)
  }

  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  const selectedComponent = selectedCoordinate ? componentsByCoordinate.get(selectedCoordinate) : undefined
  for (const testCase of selectedComponent?.cases ?? []) addTarget(selectedComponent, testCase.name)

  for (const column of workspace.columns) {
    const selectedIndex = Math.max(
      0,
      column.components.findIndex((component) => workspace.selectedCoordinatePath.includes(component.coordinate)),
    )
    for (const index of [selectedIndex - 1, selectedIndex, selectedIndex + 1]) {
      const component = column.components[index]
      if (component) addTarget(component, selectedStudioCaseName(workspace, component))
      for (const testCase of component?.cases ?? []) addTarget(component, testCase.name)
    }
  }

  return [...targets.values()].slice(0, limit)
}

function studioPreviewTarget(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  caseName: string,
  viewportPreset: StudioViewportPreset,
  sessionId: string,
): StudioPreviewWarmupTarget {
  return {
    cacheKey: studioPreviewCacheKey(component, caseName, viewportPreset),
    previewUrl: createStudioPreviewUrl(manifest, component, caseName, sessionId, { static: true }),
    sessionId,
    size: studioPreviewFrameSize(viewportPreset, undefined) as { width: number; height: number },
    title: `${component.componentName} ${caseName} warmup`,
  }
}

function warmupPreviewSessionId(cacheKey: string): string {
  return `warmup:${cacheKey}`
}

export function isGPreviewProtocolMessage(value: unknown): value is GPreviewProtocolMessage {
  const messageType = (value as { type?: unknown }).type
  return (
    typeof value === "object" &&
    value !== null &&
    typeof messageType === "string" &&
    isGPreviewSessionMessageType(messageType) &&
    (value as { protocolVersion?: unknown }).protocolVersion === G_PREVIEW_PROTOCOL_VERSION &&
    typeof (value as { sessionId?: unknown }).sessionId === "string"
  )
}

function isGPreviewSessionMessageType(type: string): type is GPreviewProtocolMessage["type"] {
  return (
    type === "gtsx:ready" ||
    type === "gtsx:tree" ||
    type === "gtsx:resize" ||
    type === "gtsx:error" ||
    type === "gtsx:request-values" ||
    type === "gtsx:values" ||
    type === "gtsx:render"
  )
}

export function resolveStudioSelection(
  manifest: StudioManifest,
  selection: string | undefined,
): { id: string; components: StudioManifestComponent[] } {
  if (!selection || selection === studioRootSelectionId) {
    return { id: studioRootSelectionId, components: rootStudioManifestComponents(manifest) }
  }

  if (selection?.startsWith("component:")) {
    const coordinate = selection.slice("component:".length)
    const component = manifest.files.flatMap((file) => file.components).find((candidate) => candidate.coordinate === coordinate)
    if (component) return { id: selection, components: [component] }
  }

  if (selection?.startsWith("file:")) {
    const filePath = selection.slice("file:".length)
    const file = manifest.files.find((candidate) => candidate.path === filePath)
    if (file) return { id: selection, components: file.components }
  }

  return { id: studioRootSelectionId, components: rootStudioManifestComponents(manifest) }
}

export function rootStudioManifestComponents(manifest: StudioManifest): StudioManifestComponent[] {
  const components = manifest.files.flatMap((file) => file.components)
  const childCoordinates = new Set(components.flatMap((component) => component.dependencies ?? []))
  const roots = components.filter((component) => !childCoordinates.has(component.coordinate))
  return roots.length > 0 ? roots : components
}
