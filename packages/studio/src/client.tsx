import {
  G_PREVIEW_PROTOCOL_VERSION,
  createGPreviewRequestValuesMessage,
  type GBoundaryRect,
  type GBoundaryTreeNode,
  type GRuntimeValuesSnapshot,
  type GPreviewProtocolMessage,
  type GPreviewRequestValuesMessage,
} from "gtsx"
import type { StudioManifest, StudioManifestComponent } from "./manifest"

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

export type StudioWorkspaceUrlState = {
  selection: string
  workspace: StudioWorkspaceState
  warning?: string
}

export function applyStudioPreviewMessage(
  state: StudioPreviewFrameState,
  message: GPreviewProtocolMessage,
): StudioPreviewFrameState {
  if (message.protocolVersion !== G_PREVIEW_PROTOCOL_VERSION || message.sessionId !== state.expectedSessionId) {
    return state
  }

  if (message.type === "gtsx:ready") {
    return { ...state, ready: true }
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
  const selected = resolveSelection(manifest, selection)
  return {
    canvasViewportPreset: "tablet",
    columns: [{ components: selected.components }],
    selectedCaseByCoordinate: {},
    selectedCoordinatePath: [],
    selectedRuntimeInstanceByCoordinate: {},
    selectedViewportPresetByCoordinate: {},
  }
}

export function selectStudioComponent(
  state: StudioWorkspaceState,
  manifest: StudioManifest,
  coordinate: string,
  tree: GBoundaryTreeNode[],
): StudioWorkspaceState {
  const selectedColumnIndex = state.columns.findIndex((column) =>
    column.components.some((component) => component.coordinate === coordinate),
  )
  if (selectedColumnIndex < 0) return state

  const nextColumns = state.columns.slice(0, selectedColumnIndex + 1)
  const selectedPath = [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate]
  const childComponents = directChildComponentsForCoordinate(manifest, tree, coordinate)
  if (childComponents.length > 0) {
    nextColumns.push({ components: childComponents })
  }

  return {
    canvasViewportPreset: canvasViewportPresetForWorkspace(state),
    columns: nextColumns,
    selectedCaseByCoordinate: state.selectedCaseByCoordinate,
    selectedCoordinatePath: selectedPath,
    selectedRuntimeInstanceByCoordinate: state.selectedRuntimeInstanceByCoordinate,
    selectedViewportPresetByCoordinate: state.selectedViewportPresetByCoordinate,
  }
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

export function createStudioWorkspaceUrlSearchParams(selection: string | undefined, workspace: StudioWorkspaceState): URLSearchParams {
  const params = new URLSearchParams()
  if (selection) params.set("selection", selection)
  const canvasViewportPreset = canvasViewportPresetForWorkspace(workspace)
  if (canvasViewportPreset !== "tablet") params.set("canvasViewport", canvasViewportPreset)

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
  const resolvedSelection = resolveSelection(manifest, selection)
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
    selection: resolvedSelection.id,
    workspace: {
      canvasViewportPreset,
      columns: [
        { components: resolvedSelection.components },
        ...selectedCoordinatePath.slice(1).map((coordinate) => {
          const component = findManifestComponent(manifest, coordinate)
          return { components: component ? [component] : [] }
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
  const sessionId = previewSessionId(sourceComponent, sourceCaseName, previewCaseOverridesForComponent(workspace, sourceComponent))
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
  tree: GBoundaryTreeNode[],
  coordinate: string,
): StudioManifestComponent[] {
  const node = findBoundaryNode(tree, coordinate)
  if (!node) return []

  const componentsByCoordinate = new Map(
    manifest.files.flatMap((file) => file.components).map((component) => [component.coordinate, component] as const),
  )
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []

  for (const child of node.children) {
    if (seen.has(child.coordinate)) continue

    const component = componentsByCoordinate.get(child.coordinate)
    if (component) {
      seen.add(child.coordinate)
      components.push(component)
    }
  }

  return components
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

export function pushStudioWorkspaceUrlState(selection: string | undefined, workspace: StudioWorkspaceState) {
  if (typeof window === "undefined") return

  const params = createStudioWorkspaceUrlSearchParams(selection, workspace)
  const search = params.toString()
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (nextUrl !== currentUrl) {
    window.history.pushState({ gtsxStudio: true }, "", nextUrl)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const studioCanvasMinScale = 0.2
const studioCanvasMaxScale = 2.5

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

export function componentCardLayoutWidth(
  displaySize: { width: number | string },
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): number {
  const rect = tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
  if (rect) return Math.max(280, Math.ceil(Math.max(0, rect.x) + rect.width))
  return typeof displaySize.width === "number" ? displaySize.width + 28 : 520
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

export function previewSessionId(
  component: StudioManifestComponent,
  caseName: string,
  caseOverrides: readonly (readonly [string, string])[] = [],
): string {
  if (caseOverrides.length === 0) return `${component.coordinate}:${caseName}`

  return `${component.coordinate}:${caseName}|${caseOverrides
    .map(([coordinate, overrideCaseName]) => `${coordinate}:${overrideCaseName}`)
    .join("|")}`
}

export function previewCaseOverridesForComponent(
  workspace: Pick<StudioWorkspaceState, "selectedCaseByCoordinate" | "selectedCoordinatePath">,
  component: StudioManifestComponent,
): readonly (readonly [string, string])[] {
  const componentPathIndex = workspace.selectedCoordinatePath.indexOf(component.coordinate)
  if (componentPathIndex < 0) return []

  return workspace.selectedCoordinatePath
    .slice(componentPathIndex + 1)
    .flatMap((coordinate) => {
      const caseName = workspace.selectedCaseByCoordinate[coordinate]
      return caseName ? ([[coordinate, caseName]] as const) : []
    })
}

export function currentPreviewSessionIds(workspace: StudioWorkspaceState): Set<string> {
  return new Set(
    workspace.columns.flatMap((column) =>
      column.components.flatMap((component) => {
        const caseName = selectedStudioCaseName(workspace, component)
        return caseName !== "No cases" ? [previewSessionId(component, caseName, previewCaseOverridesForComponent(workspace, component))] : []
      }),
    ),
  )
}

export function isGPreviewProtocolMessage(value: unknown): value is GPreviewProtocolMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    (value as { type: string }).type.startsWith("gtsx:")
  )
}

function resolveSelection(
  manifest: StudioManifest,
  selection: string | undefined,
): { id: string; components: StudioManifestComponent[] } {
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

  const firstFile = manifest.files[0]
  return { id: firstFile ? `file:${firstFile.path}` : "", components: firstFile?.components ?? [] }
}
