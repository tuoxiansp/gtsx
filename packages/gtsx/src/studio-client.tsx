"use client"

import React from "react"

import {
  G_PREVIEW_PROTOCOL_VERSION,
  createGPreviewRequestValuesMessage,
  type GRuntimeValuesSnapshot,
  type GPreviewProtocolMessage,
  type GPreviewRequestValuesMessage,
} from "./preview-protocol.js"
import type { StudioManifest, StudioManifestComponent, StudioManifestFile } from "./studio-manifest.js"
import type { GBoundaryRect, GBoundaryTreeNode } from "./runtime.js"
import type { GSerializedRuntimeValue } from "./runtime-values.js"

export type StudioShellProps = {
  manifest: StudioManifest
  selection?: string
  urlSearch?: string
}

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

export type StudioWorkspaceViewProps = {
  manifest: StudioManifest
  workspace: StudioWorkspaceState
  selection?: string
  frameStates?: Record<string, StudioPreviewFrameState>
  onChangeSelection?: (selection: string) => void
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  onChangeCanvasViewportPreset?: (preset: StudioViewportPreset) => void
  onChangeViewportPreset?: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onRequestValues?: (request: StudioRuntimeValuesRequest) => void
  onSelectComponent?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  onSelectRuntimeInstance?: (component: StudioManifestComponent, boundaryId: string) => void
  urlWarning?: string
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

export function StudioShell(props: StudioShellProps) {
  const initialUrlState = React.useMemo(
    () => createStudioWorkspaceStateFromUrl(props.manifest, initialStudioUrlSearchParams(props.selection, props.urlSearch)),
    [props.manifest, props.selection, props.urlSearch],
  )
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const [frameStates, setFrameStates] = React.useState<Record<string, StudioPreviewFrameState>>({})
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])
  const selectionRef = React.useRef(selection)

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || !sessionIds.has(message.sessionId)) return

      setFrameStates((current) => applyStudioPreviewMessageToFrameStates(current, message, sessionIds))
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [sessionIds])

  React.useEffect(() => {
    const handlePopState = () => {
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search))
      setSelection(restored.selection)
      setUrlWarning(restored.warning)
      setWorkspace(restored.workspace)
      setFrameStates({})
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [props.manifest])

  const commitWorkspace = React.useCallback(
    (updater: (current: StudioWorkspaceState) => StudioWorkspaceState) => {
      setWorkspace((current) => {
        const next = updater(current)
        pushStudioWorkspaceUrlState(selectionRef.current, next)
        return next
      })
    },
    [],
  )

  return (
    <StudioWorkspaceView
      frameStates={frameStates}
      manifest={props.manifest}
      onSelectComponent={(component, frameState) => {
        commitWorkspace((current) => selectStudioComponent(current, props.manifest, component.coordinate, frameState?.tree ?? []))
      }}
      onChangeCase={(component, caseName, options) => {
        commitWorkspace((current) => changeStudioComponentCase(current, component.coordinate, caseName, options))
      }}
      onChangeCanvasViewportPreset={(preset) => {
        commitWorkspace((current) => changeStudioCanvasViewportPreset(current, preset))
      }}
      onChangeSelection={(nextSelection) => {
        const params = new URLSearchParams()
        params.set("selection", nextSelection)
        const canvasViewportPreset = canvasViewportPresetForWorkspace(workspace)
        if (canvasViewportPreset !== "tablet") params.set("canvasViewport", canvasViewportPreset)
        const nextUrlState = createStudioWorkspaceStateFromUrl(props.manifest, params)
        selectionRef.current = nextUrlState.selection
        setSelection(nextUrlState.selection)
        setUrlWarning(nextUrlState.warning)
        setWorkspace(nextUrlState.workspace)
        setFrameStates({})
        pushStudioWorkspaceUrlState(nextUrlState.selection, nextUrlState.workspace)
      }}
      onChangeViewportPreset={(component, preset) => {
        commitWorkspace((current) => changeStudioViewportPreset(current, component.coordinate, preset))
      }}
      onPreviewFrameMount={(sessionId, frame) => {
        if (frame) {
          previewFrames.current.set(sessionId, frame)
        } else {
          previewFrames.current.delete(sessionId)
        }
      }}
      onRequestValues={(request) => {
        previewFrames.current.get(request.sessionId)?.contentWindow?.postMessage(request.message, "*")
      }}
      onSelectRuntimeInstance={(component, boundaryId) => {
        commitWorkspace((current) => selectStudioRuntimeInstance(current, component.coordinate, boundaryId))
      }}
      selection={selection}
      urlWarning={urlWarning}
      workspace={workspace}
    />
  )
}

function initialStudioUrlSearchParams(selection: string | undefined, urlSearch: string | undefined): URLSearchParams {
  if (urlSearch !== undefined) return new URLSearchParams(urlSearch)
  if (typeof window !== "undefined" && window.location.search) {
    return new URLSearchParams(window.location.search)
  }

  const params = new URLSearchParams()
  if (selection) params.set("selection", selection)
  return params
}

function pushStudioWorkspaceUrlState(selection: string | undefined, workspace: StudioWorkspaceState) {
  if (typeof window === "undefined") return

  const params = createStudioWorkspaceUrlSearchParams(selection, workspace)
  const search = params.toString()
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}`
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (nextUrl !== currentUrl) {
    window.history.pushState({ gtsxStudio: true }, "", nextUrl)
  }
}

const inspectorSectionTitleStyle: React.CSSProperties = {
  color: "#4b5563",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.8,
  margin: "0 0 8px",
  textTransform: "uppercase",
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

export function StudioWorkspaceView(props: StudioWorkspaceViewProps) {
  const selected = resolveSelection(props.manifest, props.selection)
  const [selectedCardCoordinate, setSelectedCardCoordinate] = React.useState<string | undefined>()
  const canvasViewportPreset = canvasViewportPresetForWorkspace(props.workspace)
  const [canvas, setCanvas] = React.useState<StudioCanvasTransform>({ x: 40, y: 40, scale: 1 })
  const panRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const canvasViewportRef = React.useRef<HTMLDivElement | null>(null)
  const selectedCardComponent = selectedCardCoordinate ? findManifestComponent(props.manifest, selectedCardCoordinate) : undefined
  const selectedCaseName = selectedCardComponent ? selectedStudioCaseName(props.workspace, selectedCardComponent) : undefined

  React.useEffect(() => {
    setSelectedCardCoordinate(undefined)
  }, [props.selection])

  React.useEffect(() => {
    const viewport = canvasViewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      setCanvas((current) =>
        applyStudioCanvasWheel(current, {
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          metaKey: event.metaKey,
          viewportLeft: rect.left,
          viewportTop: rect.top,
        }),
      )
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false })
    return () => viewport.removeEventListener("wheel", handleWheel)
  }, [])

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "210px minmax(0, 1fr)",
        height: "100vh",
        overflow: "hidden",
        background: "#f5f6f8",
        color: "#1f2328",
        fontFamily:
          "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      }}
    >
      <aside
        style={{
          background: "#fbfcfe",
          borderRight: "1px solid #d8dee8",
          boxShadow: "1px 0 0 rgba(255,255,255,0.8) inset",
          minHeight: 0,
          overflow: "auto",
          padding: "18px 12px",
        }}
      >
        <div style={{ display: "grid", gap: 3, marginBottom: 22 }}>
          <h1 style={{ fontSize: 18, letterSpacing: -0.2, lineHeight: 1.1, margin: 0 }}>GTSX Studio</h1>
          <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Component workspace</p>
        </div>
        {props.urlWarning ? (
          <p
            role="status"
            style={{
              background: "#fff8c5",
              border: "1px solid #d4a72c",
              borderRadius: 10,
              color: "#5a1e02",
              fontSize: 12,
              lineHeight: 1.45,
              padding: 10,
            }}
          >
            {props.urlWarning}
          </p>
        ) : null}
        <nav aria-label="GTSX component index" style={{ display: "grid", gap: 16 }}>
          {props.manifest.files.map((file) => (
            <FileGroupLink
              file={file}
              key={file.path}
              manifest={props.manifest}
              onChangeSelection={
                props.onChangeSelection
                  ? (nextSelection) => {
                      setSelectedCardCoordinate((current) => applyStudioCardSelectionAction(current, { type: "clear" }))
                      props.onChangeSelection?.(nextSelection)
                    }
                  : undefined
              }
              selectedId={selected.id}
            />
          ))}
        </nav>
      </aside>

      <section style={{ display: "grid", minHeight: 0, minWidth: 0 }}>
        <div
          aria-label="GTSX canvas viewport"
          data-gtsx-canvas-viewport
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("a,button,iframe")) return
            setSelectedCardCoordinate((current) => applyStudioCardSelectionAction(current, { type: "clear" }))
            panRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: canvas.x,
              originY: canvas.y,
            }
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // Browsers can cancel trackpad pointer streams before React handles them.
            }
          }}
          onPointerMove={(event) => {
            const pan = panRef.current
            if (!pan || pan.pointerId !== event.pointerId) return
            setCanvas((current) => ({
              ...current,
              x: pan.originX + event.clientX - pan.startX,
              y: pan.originY + event.clientY - pan.startY,
            }))
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId === event.pointerId) panRef.current = null
          }}
          onPointerCancel={(event) => {
            if (panRef.current?.pointerId === event.pointerId) panRef.current = null
          }}
          ref={canvasViewportRef}
          style={{
            backgroundColor: "#f5f6f8",
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(31,35,40,0.10) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            cursor: panRef.current ? "grabbing" : "grab",
            height: "100%",
            minHeight: 0,
            overscrollBehavior: "contain",
            overflow: "hidden",
            position: "relative",
            touchAction: "none",
          }}
          role="application"
          tabIndex={0}
        >
          <ViewportPresetTabs
            onChange={(preset) => {
              if (props.onChangeCanvasViewportPreset) {
                props.onChangeCanvasViewportPreset(preset)
              } else {
                for (const component of visibleWorkspaceComponents(props.workspace)) props.onChangeViewportPreset?.(component, preset)
              }
            }}
            selectedPreset={canvasViewportPreset}
          />
          <div
            data-gtsx-canvas-surface
            style={{
              alignItems: "flex-start",
              display: "flex",
              gap: 40,
              left: 0,
              padding: "0 80px 80px 0",
              position: "absolute",
              top: 0,
              transform: `translate(${canvas.x}px, ${canvas.y}px) scale(${canvas.scale})`,
              transformOrigin: "0 0",
            }}
          >
            {props.workspace.columns.map((column, columnIndex) => (
              <section data-gtsx-column-index={columnIndex} key={columnIndex} style={{ display: "grid", gap: 10, width: "max-content" }}>
                {column.components.map((component) => {
                  const caseName = selectedStudioCaseName(props.workspace, component)
                  const sessionId = previewSessionId(component, caseName, previewCaseOverridesForComponent(props.workspace, component))
                  return (
                    <ComponentCard
                      component={component}
                      frameState={props.frameStates?.[sessionId]}
                      key={component.coordinate}
                      manifest={props.manifest}
                      onPreviewFrameMount={props.onPreviewFrameMount}
                      onSelect={(selectedComponent, frameState, source) => {
                        setSelectedCardCoordinate((current) =>
                          applyStudioCardSelectionAction(current, {
                            type: "activate-card",
                            coordinate: selectedComponent.coordinate,
                            source,
                          }),
                        )
                        props.onSelectComponent?.(selectedComponent, frameState)
                      }}
                      selected={selectedCardCoordinate === component.coordinate}
                      selectedCaseName={caseName}
                      viewportPreset={canvasViewportPreset}
                      workspace={props.workspace}
                    />
                  )
                })}
              </section>
            ))}
          </div>
          {selectedCardComponent && selectedCaseName ? (
            <SelectedComponentCasesSidebar
              component={selectedCardComponent}
              manifest={props.manifest}
              onChangeCase={props.onChangeCase}
              selectedCaseName={selectedCaseName}
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

function ViewportPresetTabs(props: {
  onChange: (preset: StudioViewportPreset) => void
  selectedPreset: StudioViewportPreset
}) {
  const presets = ["phone", "tablet", "desktop"] satisfies StudioViewportPreset[]
  const selectedIndex = Math.max(0, presets.indexOf(props.selectedPreset))
  return (
    <div
      aria-label="Viewport"
      data-gtsx-floating-viewport-controls
      style={{
        background: "rgba(255,255,255,0.82)",
        border: "1px solid rgba(216,222,232,0.92)",
        borderRadius: 999,
        boxShadow: "0 10px 30px rgba(31,35,40,0.12)",
        display: "grid",
        gridTemplateColumns: `repeat(${presets.length}, 34px)`,
        left: "50%",
        padding: 3,
        position: "absolute",
        top: 16,
        transform: "translateX(-50%)",
        zIndex: 3,
      }}
    >
      <span
        aria-hidden="true"
        data-gtsx-viewport-tab-highlight
        style={{
          background: "#ffffff",
          border: "1px solid #d8dee8",
          borderRadius: 999,
          boxShadow: "0 3px 10px rgba(31,35,40,0.12)",
          height: 28,
          left: 3,
          position: "absolute",
          top: 3,
          transform: `translateX(${selectedIndex * 34}px)`,
          transition: "transform 120ms ease",
          width: 32,
        }}
      />
      {presets.map((preset) => (
        <button
          aria-label={`Viewport ${preset}`}
          data-gtsx-viewport-control={preset}
          key={preset}
          onClick={() => props.onChange(preset)}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            color: props.selectedPreset === preset ? "#0969da" : "#57606a",
            cursor: "pointer",
            display: "grid",
            height: 28,
            justifyItems: "center",
            padding: 0,
            position: "relative",
            width: 32,
            zIndex: 1,
          }}
          title={preset}
          type="button"
        >
          <ViewportPresetIcon preset={preset} />
        </button>
      ))}
    </div>
  )
}

function ViewportPresetIcon(props: { preset: StudioViewportPreset }) {
  if (props.preset === "phone") {
    return (
      <span
        aria-hidden="true"
        style={{
          border: "1.5px solid currentColor",
          borderRadius: 3,
          display: "block",
          height: 16,
          width: 9,
        }}
      />
    )
  }

  if (props.preset === "tablet") {
    return (
      <span
        aria-hidden="true"
        style={{
          border: "1.5px solid currentColor",
          borderRadius: 3,
          display: "block",
          height: 15,
          width: 12,
        }}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      style={{
        border: "1.5px solid currentColor",
        borderRadius: 2,
        display: "block",
        height: 11,
        width: 18,
      }}
    />
  )
}

function FileGroupLink(props: {
  file: StudioManifestFile
  manifest: StudioManifest
  onChangeSelection?: (selection: string) => void
  selectedId: string
}) {
  const fileSelection = `file:${props.file.path}`
  const fileName = props.file.path.split("/").pop() ?? props.file.path
  const directoryName = props.file.path.includes("/") ? props.file.path.slice(0, props.file.path.lastIndexOf("/")) : ""

  return (
    <section style={{ display: "grid", gap: 8 }}>
      <a
        href={`?selection=${encodeURIComponent(fileSelection)}`}
        onClick={(event) => {
          if (!props.onChangeSelection) return
          event.preventDefault()
          props.onChangeSelection(fileSelection)
        }}
        style={{
          color: props.selectedId === fileSelection ? "#0969da" : "#57606a",
          display: "grid",
          gap: 2,
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.35,
          overflowWrap: "anywhere",
          textDecoration: "none",
        }}
      >
        <span>{fileName}</span>
        {directoryName ? (
          <span style={{ color: "#8b949e", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, fontWeight: 500 }}>
            {directoryName}
          </span>
        ) : null}
      </a>
      <div style={{ display: "grid", gap: 7 }}>
        {props.file.components.map((component) => {
          const componentSelection = `component:${component.coordinate}`
          const isSelected = props.selectedId === componentSelection
          return (
            <a
              href={`?selection=${encodeURIComponent(componentSelection)}`}
              key={component.coordinate}
              onClick={(event) => {
                if (!props.onChangeSelection) return
                event.preventDefault()
                props.onChangeSelection(componentSelection)
              }}
              style={{
                background: isSelected ? "#eaf4ff" : "#ffffff",
                border: "1px solid",
                borderColor: isSelected ? "#8ec5ff" : "#d8dee8",
                borderRadius: 12,
                boxShadow: isSelected ? "0 6px 18px rgba(9,105,218,0.12)" : "0 1px 2px rgba(31,35,40,0.04)",
                color: "#1f2328",
                display: "block",
                overflow: "hidden",
                padding: 8,
                textDecoration: "none",
              }}
              title={component.componentName}
            >
              <SidebarComponentPreview component={component} manifest={props.manifest} />
            </a>
          )
        })}
      </div>
    </section>
  )
}

function SidebarComponentPreview(props: { component: StudioManifestComponent; manifest: StudioManifest }) {
  const previewUrl = sidebarPreviewUrlForComponent(props.manifest, props.component)
  const sessionId = sidebarPreviewSessionId(props.component)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const [boundaryRect, setBoundaryRect] = React.useState<GBoundaryRect | undefined>()

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: "500px" },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!shouldLoad) return

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || message.sessionId !== sessionId || message.type !== "gtsx:tree") return

      setBoundaryRect(findBoundaryNode(message.tree, props.component.coordinate)?.rect)
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [props.component.coordinate, sessionId, shouldLoad])

  const height = boundaryRect ? Math.max(1, Math.ceil((Math.max(0, boundaryRect.y) + boundaryRect.height) * 0.24)) : 96

  return (
    <div
      aria-hidden="true"
      data-gtsx-sidebar-preview-coordinate={props.component.coordinate}
      data-gtsx-sidebar-preview-loaded={shouldLoad ? "true" : undefined}
      data-gtsx-viewport-preset="tablet"
      ref={containerRef}
      style={{
        background: "#f5f6f8",
        height,
        overflow: "hidden",
        position: "relative",
        width: 184.32,
      }}
    >
      {previewUrl && shouldLoad ? (
        <iframe
          data-gtsx-sidebar-preview-frame="true"
          src={previewUrl}
          style={{
            background: "transparent",
            border: 0,
            height: 1024,
            left: 0,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            transform: "scale(0.24)",
            transformOrigin: "0 0",
            width: 768,
          }}
          tabIndex={-1}
          title={`${props.component.componentName} thumbnail`}
        />
      ) : null}
    </div>
  )
}

function sidebarPreviewUrlForComponent(manifest: StudioManifest, component: StudioManifestComponent): string | undefined {
  const caseName = component.cases[0]?.name
  if (!caseName) return undefined

  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId: sidebarPreviewSessionId(component),
  })
  return `${manifest.routes.preview}?${params.toString()}`
}

function sidebarPreviewSessionId(component: StudioManifestComponent): string {
  return `sidebar:${component.coordinate}:${component.cases[0]?.name ?? "No cases"}`
}

function SelectedComponentCasesSidebar(props: {
  component: StudioManifestComponent
  manifest: StudioManifest
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  selectedCaseName: string
}) {
  return (
    <aside
      aria-label={`${props.component.componentName} cases`}
      data-gtsx-case-sidebar={props.component.coordinate}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        background: "transparent",
        border: 0,
        boxShadow: "none",
        display: "grid",
        gap: 14,
        maxHeight: "calc(100% - 96px)",
        overflow: "auto",
        padding: 0,
        position: "absolute",
        right: 12,
        top: 72,
        width: 200,
        zIndex: 4,
      }}
    >
      {props.component.cases.map((testCase) => (
        <CasePreviewCard
          component={props.component}
          key={testCase.name}
          manifest={props.manifest}
          onChangeCase={props.onChangeCase}
          selected={props.selectedCaseName === testCase.name}
          testCaseName={testCase.name}
        />
      ))}
    </aside>
  )
}

function CasePreviewCard(props: {
  component: StudioManifestComponent
  manifest: StudioManifest
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  selected: boolean
  testCaseName: string
}) {
  const sessionId = casePreviewSessionId(props.component, props.testCaseName)
  const previewUrl = casePreviewUrlForComponent(props.manifest, props.component, props.testCaseName)
  const [boundaryRect, setBoundaryRect] = React.useState<GBoundaryRect | undefined>()

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || message.sessionId !== sessionId || message.type !== "gtsx:tree") return

      setBoundaryRect(findBoundaryNode(message.tree, props.component.coordinate)?.rect)
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [props.component.coordinate, sessionId])

  const height = boundaryRect ? Math.max(64, Math.ceil((Math.max(0, boundaryRect.y) + boundaryRect.height) * 0.25)) : 112

  return (
    <div
      data-gtsx-case-preview-card={props.testCaseName}
      data-gtsx-case-preview-selected={props.selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        props.onChangeCase?.(props.component, props.testCaseName, { keepDrilldown: true })
      }}
      onClick={() => props.onChangeCase?.(props.component, props.testCaseName, { keepDrilldown: true })}
      role="button"
      style={{
        background: "transparent",
        border: 0,
        boxShadow: "none",
        color: "#1f2328",
        cursor: props.onChangeCase ? "pointer" : "default",
        display: "grid",
        gap: 6,
        padding: 0,
        textAlign: "left",
      }}
      tabIndex={0}
    >
      <strong style={{ fontSize: 12, lineHeight: 1.2 }}>{props.testCaseName}</strong>
      <div
        aria-hidden="true"
        data-gtsx-case-preview-frame={props.testCaseName}
        style={{
          background: "#f5f6f8",
          border: "1px solid",
          borderColor: props.selected ? "#0d99ff" : "transparent",
          height,
          overflow: "hidden",
          position: "relative",
          width: 192,
        }}
      >
        <iframe
          src={previewUrl}
          style={{
            background: "transparent",
            border: 0,
            height: 1024,
            left: 0,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            transform: "scale(0.25)",
            transformOrigin: "0 0",
            width: 768,
          }}
          tabIndex={-1}
          title={`${props.component.componentName} ${props.testCaseName} preview`}
        />
      </div>
    </div>
  )
}

function casePreviewUrlForComponent(manifest: StudioManifest, component: StudioManifestComponent, caseName: string): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId: casePreviewSessionId(component, caseName),
  })
  return `${manifest.routes.preview}?${params.toString()}`
}

function casePreviewSessionId(component: StudioManifestComponent, caseName: string): string {
  return `case:${component.coordinate}:${caseName}`
}

function ComponentCard(props: {
  component: StudioManifestComponent
  frameState?: StudioPreviewFrameState
  manifest: StudioManifest
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelect?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined, source: StudioCardSelectionSource) => void
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
  workspace: StudioWorkspaceState
}) {
  const defaultCase = props.selectedCaseName
  const previewError = getPreviewError(props.component)
  const caseOverrides = previewCaseOverridesForComponent(props.workspace, props.component)
  const sessionId = previewSessionId(props.component, defaultCase, caseOverrides)
  const previewSize = previewFrameSize(props.viewportPreset, props.frameState?.size)
  const [measuredSize, setMeasuredSize] = React.useState<{ width: number; height: number } | undefined>()
  const displaySize = mergePreviewFrameSize(previewSize, measuredSize, props.viewportPreset)
  const previewUrl = previewUrlForComponent(props.manifest, props.component, defaultCase, caseOverrides)
  const cardWidth = componentCardLayoutWidth(displaySize, props.frameState?.tree, props.component.coordinate)
  const selectedBoundaryRect = props.selected ? selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate) : undefined

  return (
    <article
      aria-pressed={props.selected}
      data-gtsx-card-coordinate={props.component.coordinate}
      data-gtsx-card-selected={props.selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        props.onSelect?.(props.component, props.frameState, "keyboard")
      }}
      role="button"
      style={{
        cursor: props.onSelect ? "pointer" : "default",
        display: "grid",
        gap: 6,
        width: cardWidth,
      }}
      tabIndex={0}
    >
      <strong
        style={{
          color: "inherit",
          fontSize: 13,
          letterSpacing: -0.05,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {props.component.componentName}
      </strong>
      {previewError || props.frameState?.error ? (
        <PreviewError
          caseName={defaultCase}
          coordinate={props.component.coordinate}
          error={props.frameState?.error ?? { message: previewError ?? "Unknown preview error" }}
          previewUrl={previewUrl}
        />
      ) : (
        <LazyPreviewFrame
          data-gtsx-preview-session-id={sessionId}
          boundaryRect={selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate)}
          coordinate={props.component.coordinate}
          onMeasureSize={setMeasuredSize}
          onSelect={() => props.onSelect?.(props.component, props.frameState, "pointer")}
          onPreviewFrameMount={props.onPreviewFrameMount}
          previewUrl={previewUrl}
          selectedBoundaryRect={selectedBoundaryRect}
          size={displaySize}
          sessionId={sessionId}
          title={`${props.component.componentName} preview`}
          viewportPreset={props.viewportPreset}
        />
      )}
    </article>
  )
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

function canvasViewportPresetForWorkspace(workspace: StudioWorkspaceState): StudioViewportPreset {
  if (workspace.canvasViewportPreset) return workspace.canvasViewportPreset

  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (selectedCoordinate) return workspace.selectedViewportPresetByCoordinate[selectedCoordinate] ?? "tablet"
  return Object.values(workspace.selectedViewportPresetByCoordinate)[0] ?? "tablet"
}

function visibleWorkspaceComponents(workspace: StudioWorkspaceState): StudioManifestComponent[] {
  const seen = new Set<string>()
  const components: StudioManifestComponent[] = []
  for (const component of workspace.columns.flatMap((column) => column.components)) {
    if (seen.has(component.coordinate)) continue
    seen.add(component.coordinate)
    components.push(component)
  }
  return components
}

function selectedBoundaryRectForComponent(
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): GBoundaryRect | undefined {
  return tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
}

function LazyPreviewFrame(props: {
  "data-gtsx-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
  onMeasureSize?: (size: { width: number; height: number }) => void
  onSelect?: () => void
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  previewUrl: string
  selectedBoundaryRect?: GBoundaryRect
  size: { width: number | string; height: number }
  sessionId: string
  title: string
  viewportPreset: StudioViewportPreset
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [frameElement, setFrameElement] = React.useState<HTMLIFrameElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const layoutHeight = previewFrameLayoutHeight(props.size, props.boundaryRect)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: "600px" },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!frameElement) return

    const measure = () => {
      const size = measureIframeContentSize(frameElement)
      if (size) props.onMeasureSize?.(size)
    }
    const timers = [window.setTimeout(measure, 0), window.setTimeout(measure, 80), window.setTimeout(measure, 250)]
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [frameElement, props.onMeasureSize])

  return (
    <div
      data-gtsx-preview-session-id={props["data-gtsx-preview-session-id"]}
      data-gtsx-preview-src={props.previewUrl}
      data-gtsx-viewport-preset={props.viewportPreset}
      ref={containerRef}
      style={{
        height: layoutHeight,
        overflow: "visible",
        position: "relative",
        width: props.size.width,
      }}
    >
      {shouldLoad ? (
        <iframe
          onLoad={(event) => {
            const frame = event.currentTarget
            const measure = () => {
              const size = measureIframeContentSize(frame)
              if (size) props.onMeasureSize?.(size)
            }
            measure()
            window.setTimeout(measure, 80)
          }}
          ref={(frame) => {
            setFrameElement(frame)
            props.onPreviewFrameMount?.(props.sessionId, frame)
          }}
          src={props.previewUrl}
          style={{
            background: "transparent",
            border: 0,
            height: props.size.height,
            pointerEvents: "none",
            position: "absolute",
            width: props.size.width,
          }}
          title={props.title}
        />
      ) : null}
      {props.boundaryRect ? <ComponentBoundsHitTarget coordinate={props.coordinate} onSelect={props.onSelect} rect={props.boundaryRect} /> : null}
      {props.selectedBoundaryRect ? <SelectedBoundaryOutline rect={props.selectedBoundaryRect} /> : null}
    </div>
  )
}

function ComponentBoundsHitTarget(props: { coordinate: string; onSelect?: () => void; rect: GBoundaryRect }) {
  return (
    <div
      aria-hidden="true"
      data-gtsx-card-select-coordinate={props.coordinate}
      data-gtsx-card-select-target="component-bounds"
      onClick={(event) => {
        event.stopPropagation()
        props.onSelect?.()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        height: props.rect.height,
        left: props.rect.x,
        pointerEvents: "auto",
        position: "absolute",
        top: props.rect.y,
        width: props.rect.width,
        zIndex: 2,
      }}
    />
  )
}

function SelectedBoundaryOutline(props: { rect: GBoundaryRect }) {
  return (
    <div
      aria-hidden="true"
      data-gtsx-selection-outline="true"
      style={{
        height: props.rect.height,
        left: props.rect.x,
        outline: "1px solid #0d99ff",
        pointerEvents: "none",
        position: "absolute",
        top: props.rect.y,
        width: props.rect.width,
        zIndex: 1,
      }}
    />
  )
}

function mergePreviewFrameSize(
  reported: { width: number | string; height: number },
  _measured: { width: number; height: number } | undefined,
  _preset: StudioViewportPreset,
): { width: number | string; height: number } {
  return reported
}

function previewFrameLayoutHeight(
  displaySize: { height: number },
  rect: GBoundaryRect | undefined,
): number {
  if (!rect) return displaySize.height
  return Math.max(1, Math.ceil(Math.max(0, rect.y) + rect.height))
}

function measureIframeContentSize(frame: HTMLIFrameElement): { width: number; height: number } | undefined {
  const documentValue = frame.contentDocument
  if (!documentValue) return undefined

  const rects = [...documentValue.querySelectorAll<HTMLElement>("*")]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0)

  if (rects.length === 0) {
    return {
      width: documentValue.documentElement.scrollWidth,
      height: documentValue.documentElement.scrollHeight,
    }
  }

  const left = Math.min(0, ...rects.map((rect) => rect.left))
  const top = Math.min(0, ...rects.map((rect) => rect.top))
  const right = Math.max(documentValue.documentElement.scrollWidth, ...rects.map((rect) => rect.right))
  const bottom = Math.max(documentValue.documentElement.scrollHeight, ...rects.map((rect) => rect.bottom))

  return {
    width: Math.ceil(right - left + 24),
    height: Math.ceil(bottom - top),
  }
}

function previewFrameSize(
  preset: StudioViewportPreset,
  reportedSize: StudioPreviewFrameState["size"] | undefined,
): { width: number | string; height: number } {
  if (preset === "phone") return { width: 390, height: 844 }
  if (preset === "tablet") return { width: 768, height: 1024 }
  if (preset === "desktop") return { width: 1280, height: 900 }
  return { width: 768, height: clamp(reportedSize?.height ?? 1024, 160, 1200) }
}

function PreviewError(props: {
  caseName: string
  coordinate: string
  error: {
    message: string
    stack?: string
  }
  previewUrl: string
}) {
  return (
    <div
      role="status"
      style={{ background: "#fff8c5", border: "1px solid #d4a72c", borderRadius: 8, color: "#5a1e02", padding: 12 }}
    >
      <strong>Preview unavailable</strong>
      <p style={{ margin: "6px 0 0" }}>{props.error.message}</p>
      {props.error.stack ? <pre style={{ whiteSpace: "pre-wrap" }}>{props.error.stack}</pre> : null}
      <dl style={{ display: "grid", gap: 4, margin: "8px 0 0" }}>
        <div>
          <dt>Entry</dt>
          <dd style={{ margin: 0 }}>{props.coordinate}</dd>
        </div>
        <div>
          <dt>Case</dt>
          <dd style={{ margin: 0 }}>{props.caseName}</dd>
        </div>
        <div>
          <dt>Preview URL</dt>
          <dd style={{ margin: 0 }}>
            <code>{props.previewUrl}</code>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function StudioInspector(props: {
  component: StudioManifestComponent | undefined
  frameStates?: Record<string, StudioPreviewFrameState>
  manifest: StudioManifest
  onChangeCase?: (component: StudioManifestComponent, caseName: string) => void
  onChangeViewportPreset?: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onRequestValues?: (request: StudioRuntimeValuesRequest) => void
  onSelectRuntimeInstance?: (component: StudioManifestComponent, boundaryId: string) => void
  workspace: StudioWorkspaceState
}) {
  if (!props.component) {
    return (
      <aside style={{ background: "#fbfcfe", borderLeft: "1px solid #d8dee8", minHeight: 0, overflow: "auto", padding: 20 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Inspector</h2>
        <p style={{ color: "#6b7280", fontSize: 13 }}>Select a GTSX component.</p>
      </aside>
    )
  }

  const selectedCase = selectedStudioCaseName(props.workspace, props.component)
  const selectedViewportPreset = props.workspace.selectedViewportPresetByCoordinate[props.component.coordinate] ?? "tablet"
  const instances = runtimeInstancesForSelectedComponent(props.manifest, props.workspace, props.frameStates)
  const selectedValues = selectedRuntimeValuesSnapshot(props.manifest, props.workspace, props.frameStates)

  return (
    <aside style={{ background: "#fbfcfe", borderLeft: "1px solid #d8dee8", minHeight: 0, overflow: "auto", padding: "22px 18px" }}>
      <h2 style={{ fontSize: 16, letterSpacing: -0.1, margin: "0 0 18px" }}>Inspector</h2>
      <section style={{ borderBottom: "1px solid #e5e7eb", display: "grid", gap: 5, marginBottom: 18, paddingBottom: 16 }}>
        <strong style={{ fontSize: 14 }}>{props.component.componentName}</strong>
        <code
          style={{
            color: "#6b7280",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.4,
            overflowWrap: "anywhere",
          }}
        >
          {props.component.coordinate}
        </code>
      </section>
      <section>
        <h3 style={inspectorSectionTitleStyle}>Cases</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {props.component.cases.map((testCase) => (
            <button
              data-gtsx-case-control={testCase.name}
              key={testCase.name}
              onClick={() => props.onChangeCase?.(props.component!, testCase.name)}
              style={{
                background: selectedCase === testCase.name ? "#eaf4ff" : "#ffffff",
                border: "1px solid",
                borderColor: selectedCase === testCase.name ? "#8ec5ff" : "#d8dee8",
                borderRadius: 10,
                color: "#24292f",
                cursor: props.onChangeCase ? "pointer" : "default",
                fontWeight: selectedCase === testCase.name ? 700 : 500,
                padding: "9px 10px",
                textAlign: "left",
              }}
              type="button"
            >
              {testCase.name}
            </button>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <h3 style={inspectorSectionTitleStyle}>Viewport</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {(["phone", "tablet", "desktop"] satisfies StudioViewportPreset[]).map((preset) => (
            <button
              data-gtsx-viewport-control={preset}
              key={preset}
              onClick={() => props.onChangeViewportPreset?.(props.component!, preset)}
              style={{
                background: selectedViewportPreset === preset ? "#eaf4ff" : "#ffffff",
                border: "1px solid",
                borderColor: selectedViewportPreset === preset ? "#8ec5ff" : "#d8dee8",
                borderRadius: 10,
                color: "#24292f",
                cursor: props.onChangeViewportPreset ? "pointer" : "default",
                fontWeight: selectedViewportPreset === preset ? 700 : 500,
                padding: "9px 10px",
                textAlign: "left",
              }}
              type="button"
            >
              {preset}
            </button>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <h3 style={inspectorSectionTitleStyle}>Instances</h3>
        {instances.length > 0 ? (
          <ol style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {instances.map((instance) => (
              <li
                data-gtsx-runtime-instance-id={instance.boundaryId}
                key={instance.boundaryId}
                style={{
                  background: "#ffffff",
                  border: "1px solid #d8dee8",
                  borderRadius: 10,
                  display: "grid",
                  gap: 4,
                  padding: "10px",
                }}
              >
                <button
                  onClick={() => {
                    props.onSelectRuntimeInstance?.(props.component!, instance.boundaryId)
                    const request = createStudioRuntimeValuesRequest(props.manifest, props.workspace, instance.boundaryId)
                    if (request) props.onRequestValues?.(request)
                  }}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "inherit",
                    cursor: props.onRequestValues ? "pointer" : "default",
                    font: "inherit",
                    padding: 0,
                    textAlign: "left",
                  }}
                  type="button"
                >
                  <strong style={{ fontSize: 12 }}>{instance.boundaryId}</strong>
                </button>
                <span style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                  Parent: {instance.parentPath.join(" > ") || "root"}
                </span>
                {instance.rect ? (
                  <span style={{ color: "#6b7280", fontSize: 11 }}>
                    {instance.rect.width}x{instance.rect.height} at {instance.rect.x},{instance.rect.y}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>No runtime instances reported yet.</p>
        )}
      </section>
      <section style={{ marginTop: 20 }}>
        <h3 style={inspectorSectionTitleStyle}>Values</h3>
        {selectedValues ? (
          <div style={{ display: "grid", gap: 12 }}>
            <RuntimeValueSection label="Props" value={selectedValues.props} />
            {selectedValues.scope ? <RuntimeValueSection label="Scope" value={selectedValues.scope} /> : null}
            <section>
              <h4 style={{ fontSize: 12, margin: "0 0 6px" }}>Provider Values</h4>
              {selectedValues.providerValues.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {selectedValues.providerValues.map((providerValue) => (
                    <RuntimeValueSection key={providerValue.providerName} label={providerValue.providerName} value={providerValue.value} />
                  ))}
                </div>
              ) : (
                <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>No provider values reported.</p>
              )}
            </section>
          </div>
        ) : (
          <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>Select an instance to request runtime values.</p>
        )}
      </section>
    </aside>
  )
}

function RuntimeValueSection(props: { label: string; value: GSerializedRuntimeValue }) {
  return (
    <section>
      <h4 style={{ fontSize: 12, margin: "0 0 6px" }}>{props.label}</h4>
      <SerializedRuntimeValueView value={props.value} />
    </section>
  )
}

function SerializedRuntimeValueView(props: { value: GSerializedRuntimeValue }) {
  const value = props.value
  if (value.type === "object") {
    return <RuntimeEntries entries={value.entries} />
  }
  if (value.type === "array") {
    return <RuntimeEntries entries={value.values.map((item, index) => ({ key: `[${index}]`, value: item }))} />
  }
  if (value.type === "map") {
    return (
      <RuntimeEntries
        entries={value.entries.map(([entryKey, entryValue], index) => ({
          key: `entry ${index}`,
          value: { type: "array", values: [entryKey, entryValue] },
        }))}
      />
    )
  }
  if (value.type === "set") {
    return <RuntimeEntries entries={value.values.map((item, index) => ({ key: `value ${index}`, value: item }))} />
  }
  if (value.type === "react-element") {
    return (
      <RuntimeEntries
        entries={[
          { key: "type", value: { type: "string", value: value.elementType } },
          { key: "props", value: value.props },
        ]}
      />
    )
  }

  return <span style={{ color: "#57606a", fontSize: 12 }}>{runtimeValueLabel(value)}</span>
}

function RuntimeEntries(props: { entries: { key: string; value: GSerializedRuntimeValue }[] }) {
  return (
    <dl style={{ display: "grid", gap: 6, margin: 0 }}>
      {props.entries.map((entry) => (
        <div key={entry.key} style={{ display: "grid", gap: 2 }}>
          <dt style={{ color: "#57606a", fontSize: 12 }}>{entry.key}</dt>
          <dd style={{ margin: 0, paddingLeft: 8 }}>
            <SerializedRuntimeValueView value={entry.value} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function runtimeValueLabel(value: GSerializedRuntimeValue): string {
  if (value.type === "undefined") return "undefined"
  if (value.type === "null") return "null"
  if (value.type === "string") return value.value
  if (value.type === "number" || value.type === "boolean") return String(value.value)
  if (value.type === "bigint") return `${value.value}n`
  if (value.type === "symbol" || value.type === "function") return value.displayName
  if (value.type === "date") return value.value
  if (value.type === "error") return `${value.name}: ${value.message}`
  if (value.type === "circular") return `Circular reference to ${value.path}`
  return "Truncated at max depth"
}

function runtimeInstancesForSelectedComponent(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
): StudioRuntimeInstance[] {
  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (!selectedCoordinate) return []

  const parentCoordinate = workspace.selectedCoordinatePath.at(-2)
  if (parentCoordinate) {
    const parentComponent = findManifestComponent(manifest, parentCoordinate)
    if (!parentComponent) return []

    const parentCaseName = selectedStudioCaseName(workspace, parentComponent)
    const parentFrameState =
      frameStates?.[previewSessionId(parentComponent, parentCaseName, previewCaseOverridesForComponent(workspace, parentComponent))]
    return findBoundaryNodes(parentFrameState?.tree ?? [], parentCoordinate).flatMap((parentNode) =>
      parentNode.children
        .filter((child) => child.coordinate === selectedCoordinate)
        .map((child) => toRuntimeInstance(child, [parentCoordinate])),
    )
  }

  const selectedComponent = findManifestComponent(manifest, selectedCoordinate)
  if (!selectedComponent) return []

  const selectedCaseName = selectedStudioCaseName(workspace, selectedComponent)
  const selectedFrameState =
    frameStates?.[previewSessionId(selectedComponent, selectedCaseName, previewCaseOverridesForComponent(workspace, selectedComponent))]
  return findBoundaryNodes(selectedFrameState?.tree ?? [], selectedCoordinate).map((node) => toRuntimeInstance(node, []))
}

function selectedRuntimeValuesSnapshot(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
): GRuntimeValuesSnapshot | undefined {
  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (!selectedCoordinate) return undefined

  const selectedBoundaryId = workspace.selectedRuntimeInstanceByCoordinate[selectedCoordinate]
  if (!selectedBoundaryId) return undefined

  const sourceCoordinate = workspace.selectedCoordinatePath.at(-2) ?? selectedCoordinate
  const sourceComponent = findManifestComponent(manifest, sourceCoordinate)
  if (!sourceComponent) return undefined

  const sourceCaseName = selectedStudioCaseName(workspace, sourceComponent)
  const sourceFrameState =
    frameStates?.[previewSessionId(sourceComponent, sourceCaseName, previewCaseOverridesForComponent(workspace, sourceComponent))]
  return sourceFrameState?.valuesByBoundaryId?.[selectedBoundaryId]
}

function toRuntimeInstance(node: GBoundaryTreeNode, parentPath: string[]): StudioRuntimeInstance {
  return {
    boundaryId: node.id,
    coordinate: node.coordinate,
    parentPath,
    ...(node.rect ? { rect: node.rect } : {}),
  }
}

function findManifestComponent(manifest: StudioManifest, coordinate: string): StudioManifestComponent | undefined {
  return manifest.files.flatMap((file) => file.components).find((component) => component.coordinate === coordinate)
}

function findBoundaryNodes(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode[] {
  return tree.flatMap((node) => {
    const childMatches = findBoundaryNodes(node.children, coordinate)
    return node.coordinate === coordinate ? [node, ...childMatches] : childMatches
  })
}

function selectedInspectorComponent(
  manifest: StudioManifest,
  workspace: StudioWorkspaceState,
): StudioManifestComponent | undefined {
  const selectedCoordinate = workspace.selectedCoordinatePath.at(-1)
  if (selectedCoordinate) {
    return manifest.files.flatMap((file) => file.components).find((component) => component.coordinate === selectedCoordinate)
  }

  return workspace.columns[0]?.components[0]
}

function getPreviewError(component: StudioManifestComponent): string | undefined {
  if (component.diagnostics.length > 0) {
    return component.diagnostics.map((diagnostic) => diagnostic.code).join(", ")
  }

  if (!component.cases[0]) {
    return "missing-case"
  }

  return undefined
}

function previewUrlForComponent(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  caseName: string,
  caseOverrides: readonly (readonly [string, string])[] = [],
): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId: previewSessionId(component, caseName, caseOverrides),
  })
  for (const [coordinate, overrideCaseName] of caseOverrides) {
    params.append("gcase", `${coordinate}:${overrideCaseName}`)
  }

  return `${manifest.routes.preview}?${params.toString()}`
}

function previewSessionId(
  component: StudioManifestComponent,
  caseName: string,
  caseOverrides: readonly (readonly [string, string])[] = [],
): string {
  if (caseOverrides.length === 0) return `${component.coordinate}:${caseName}`

  return `${component.coordinate}:${caseName}|${caseOverrides
    .map(([coordinate, overrideCaseName]) => `${coordinate}:${overrideCaseName}`)
    .join("|")}`
}

function previewCaseOverridesForComponent(
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

function currentPreviewSessionIds(workspace: StudioWorkspaceState): Set<string> {
  return new Set(
    workspace.columns.flatMap((column) =>
      column.components.flatMap((component) => {
        const caseName = selectedStudioCaseName(workspace, component)
        return caseName !== "No cases" ? [previewSessionId(component, caseName, previewCaseOverridesForComponent(workspace, component))] : []
      }),
    ),
  )
}

function isGPreviewProtocolMessage(value: unknown): value is GPreviewProtocolMessage {
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
