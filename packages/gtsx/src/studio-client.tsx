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
  columns: StudioWorkspaceColumn[]
  selectedCaseByCoordinate: Record<string, string>
  selectedCoordinatePath: string[]
  selectedRuntimeInstanceByCoordinate: Record<string, string>
  selectedViewportPresetByCoordinate: Record<string, StudioViewportPreset>
}

export type StudioViewportPreset = "content" | "phone" | "tablet" | "desktop"

export type StudioWorkspaceViewProps = {
  manifest: StudioManifest
  workspace: StudioWorkspaceState
  selection?: string
  frameStates?: Record<string, StudioPreviewFrameState>
  onChangeCase?: (component: StudioManifestComponent, caseName: string) => void
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
): StudioWorkspaceState {
  const selectedColumnIndex = state.columns.findIndex((column) =>
    column.components.some((component) => component.coordinate === coordinate),
  )
  const columns = selectedColumnIndex >= 0 ? state.columns.slice(0, selectedColumnIndex + 1) : state.columns

  return {
    columns,
    selectedCaseByCoordinate: {
      ...state.selectedCaseByCoordinate,
      [coordinate]: caseName,
    },
    selectedCoordinatePath:
      selectedColumnIndex >= 0 ? [...state.selectedCoordinatePath.slice(0, selectedColumnIndex), coordinate] : state.selectedCoordinatePath,
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
  const { [coordinate]: _currentPreset, ...remainingPresets } = state.selectedViewportPresetByCoordinate
  return {
    ...state,
    selectedViewportPresetByCoordinate:
      preset === "content"
        ? remainingPresets
        : {
            ...remainingPresets,
            [coordinate]: preset,
          },
  }
}

export function createStudioWorkspaceUrlSearchParams(selection: string | undefined, workspace: StudioWorkspaceState): URLSearchParams {
  const params = new URLSearchParams()
  if (selection) params.set("selection", selection)

  for (const coordinate of workspace.selectedCoordinatePath) {
    params.append("path", coordinate)
  }

  for (const coordinate of workspace.selectedCoordinatePath) {
    const caseName = workspace.selectedCaseByCoordinate[coordinate]
    if (caseName) params.append("case", `${coordinate}:${caseName}`)

    const boundaryId = workspace.selectedRuntimeInstanceByCoordinate[coordinate]
    if (boundaryId) params.append("instance", `${coordinate}:${boundaryId}`)

    const viewport = workspace.selectedViewportPresetByCoordinate[coordinate]
    if (viewport) params.append("viewport", `${coordinate}:${viewport}`)
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
  const hasInvalidUrlState =
    Boolean(selection && selection !== resolvedSelection.id) ||
    rawPath.length !== selectedCoordinatePath.length ||
    hasInvalidSelectedCase(manifest, params, pathCoordinates) ||
    hasInvalidSelectedRuntimeInstance(manifest, params, pathCoordinates)
  const warning = hasInvalidUrlState ? "Invalid Studio URL state was ignored." : undefined

  if (selectedCoordinatePath.length === 0) {
    return {
      selection: resolvedSelection.id,
      workspace: {
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
  const sessionId = previewSessionId(sourceComponent, sourceCaseName)
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
    if (parsed && pathCoordinates.has(parsed.coordinate) && isStudioViewportPreset(parsed.value) && parsed.value !== "content") {
      selectedPresets[parsed.coordinate] = parsed.value
    }
  }
  return selectedPresets
}

function isStudioViewportPreset(value: string): value is StudioViewportPreset {
  return value === "content" || value === "phone" || value === "tablet" || value === "desktop"
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
      onChangeCase={(component, caseName) => {
        commitWorkspace((current) => changeStudioComponentCase(current, component.coordinate, caseName))
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
  if (urlSearch) return new URLSearchParams(urlSearch)
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

export function StudioWorkspaceView(props: StudioWorkspaceViewProps) {
  const selected = resolveSelection(props.manifest, props.selection)

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr) 320px",
        minHeight: "100vh",
        background: "#f6f8fa",
        color: "#24292f",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <aside style={{ borderRight: "1px solid #d0d7de", background: "#ffffff", padding: 20 }}>
        <h1 style={{ fontSize: 18, margin: "0 0 20px" }}>GTSX Studio</h1>
        {props.urlWarning ? (
          <p
            role="status"
            style={{ background: "#fff8c5", border: "1px solid #d4a72c", borderRadius: 8, color: "#5a1e02", fontSize: 12, padding: 8 }}
          >
            {props.urlWarning}
          </p>
        ) : null}
        <nav aria-label="GTSX component index" style={{ display: "grid", gap: 16 }}>
          {props.manifest.files.map((file) => (
            <FileGroupLink file={file} key={file.path} selectedId={selected.id} />
          ))}
        </nav>
      </aside>

      <section style={{ padding: 24 }}>
        <div style={{ alignItems: "start", display: "flex", gap: 20, overflowX: "auto" }}>
          {props.workspace.columns.map((column, columnIndex) => (
            <section
              data-gtsx-column-index={columnIndex}
              key={columnIndex}
              style={{ display: "grid", flex: "0 0 360px", gap: 16 }}
            >
              <p style={{ color: "#57606a", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, margin: 0 }}>
                {columnIndex === 0 ? "First column" : `Column ${columnIndex + 1}`}
              </p>
              {column.components.map((component) => {
                const caseName = selectedStudioCaseName(props.workspace, component)
                const sessionId = previewSessionId(component, caseName)
                return (
                  <ComponentCard
                    component={component}
                    frameState={props.frameStates?.[sessionId]}
                    key={component.coordinate}
                    manifest={props.manifest}
                    onPreviewFrameMount={props.onPreviewFrameMount}
                    onSelect={props.onSelectComponent}
                    selectedCaseName={caseName}
                    viewportPreset={props.workspace.selectedViewportPresetByCoordinate[component.coordinate] ?? "content"}
                  />
                )
              })}
            </section>
          ))}
        </div>
      </section>

      <StudioInspector
        component={selectedInspectorComponent(props.manifest, props.workspace)}
        frameStates={props.frameStates}
        manifest={props.manifest}
        onChangeCase={props.onChangeCase}
        onChangeViewportPreset={props.onChangeViewportPreset}
        onRequestValues={props.onRequestValues}
        onSelectRuntimeInstance={props.onSelectRuntimeInstance}
        workspace={props.workspace}
      />
    </main>
  )
}

function FileGroupLink(props: { file: StudioManifestFile; selectedId: string }) {
  const fileSelection = `file:${props.file.path}`

  return (
    <section>
      <a
        href={`?selection=${encodeURIComponent(fileSelection)}`}
        style={{
          color: props.selectedId === fileSelection ? "#0969da" : "#24292f",
          display: "block",
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 8,
          textDecoration: "none",
        }}
      >
        {props.file.path}
      </a>
      <div style={{ display: "grid", gap: 6 }}>
        {props.file.components.map((component) => {
          const componentSelection = `component:${component.coordinate}`
          return (
            <a
              href={`?selection=${encodeURIComponent(componentSelection)}`}
              key={component.coordinate}
              style={{
                border: "1px solid #d0d7de",
                borderColor: props.selectedId === componentSelection ? "#0969da" : "#d0d7de",
                borderRadius: 8,
                color: "#24292f",
                display: "grid",
                gap: 2,
                padding: "8px 10px",
                textDecoration: "none",
              }}
            >
              <strong style={{ fontSize: 13 }}>{component.componentName}</strong>
              <span style={{ color: "#57606a", fontSize: 11 }}>{component.coordinate}</span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function ComponentCard(props: {
  component: StudioManifestComponent
  frameState?: StudioPreviewFrameState
  manifest: StudioManifest
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelect?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
}) {
  const defaultCase = props.selectedCaseName
  const previewError = getPreviewError(props.component)
  const sessionId = previewSessionId(props.component, defaultCase)
  const previewSize = previewFrameSize(props.viewportPreset, props.frameState?.size)
  const previewUrl = previewUrlForComponent(props.manifest, props.component, defaultCase)

  return (
    <article
      data-gtsx-card-coordinate={props.component.coordinate}
      style={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 12, padding: 16 }}
    >
      <button
        onClick={() => props.onSelect?.(props.component, props.frameState)}
        style={{
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: props.onSelect ? "pointer" : "default",
          display: "block",
          margin: 0,
          padding: 0,
          textAlign: "left",
          width: "100%",
        }}
        type="button"
      >
        <header style={{ display: "grid", gap: 4, marginBottom: 12 }}>
        <strong>{props.component.componentName}</strong>
        <code style={{ color: "#57606a", fontSize: 12 }}>{props.component.coordinate}</code>
        <span style={{ color: "#57606a", fontSize: 12 }}>Current case: {defaultCase}</span>
        </header>
      </button>
      {previewError || props.frameState?.error ? (
        <PreviewError
          caseName={defaultCase}
          coordinate={props.component.coordinate}
          error={props.frameState?.error ?? { message: previewError ?? "Unknown preview error" }}
          previewUrl={previewUrl}
        />
      ) : (
        <>
          <LazyPreviewFrame
            data-gtsx-preview-session-id={sessionId}
            onPreviewFrameMount={props.onPreviewFrameMount}
            previewUrl={previewUrl}
            size={previewSize}
            sessionId={sessionId}
            title={`${props.component.componentName} preview`}
            viewportPreset={props.viewportPreset}
          />
          <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {props.component.cases.map((testCase) => (
              <li
                key={testCase.name}
                style={{
                  background: "#f6f8fa",
                  border: "1px solid #d0d7de",
                  borderRadius: 999,
                  fontSize: 12,
                  padding: "4px 8px",
                }}
              >
                {testCase.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  )
}

function LazyPreviewFrame(props: {
  "data-gtsx-preview-session-id": string
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  previewUrl: string
  size: { width: number | string; height: number }
  sessionId: string
  title: string
  viewportPreset: StudioViewportPreset
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)

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

  return (
    <div
      data-gtsx-preview-session-id={props["data-gtsx-preview-session-id"]}
      data-gtsx-preview-src={props.previewUrl}
      data-gtsx-viewport-preset={props.viewportPreset}
      ref={containerRef}
      style={{
        background: "#ffffff",
        border: "1px solid #d0d7de",
        borderRadius: 8,
        height: props.size.height,
        maxWidth: "100%",
        overflow: "hidden",
        width: props.size.width,
      }}
    >
      {shouldLoad ? (
        <iframe
          ref={(frame) => props.onPreviewFrameMount?.(props.sessionId, frame)}
          src={props.previewUrl}
          style={{ border: 0, height: "100%", width: "100%" }}
          title={props.title}
        />
      ) : (
        <p style={{ color: "#57606a", fontSize: 12, margin: 0, padding: 12 }}>Preview will load when visible.</p>
      )}
    </div>
  )
}

function previewFrameSize(
  preset: StudioViewportPreset,
  reportedSize: StudioPreviewFrameState["size"] | undefined,
): { width: number | string; height: number } {
  if (preset === "phone") return { width: 390, height: 844 }
  if (preset === "tablet") return { width: 768, height: 1024 }
  if (preset === "desktop") return { width: "100%", height: 900 }
  return { width: "100%", height: reportedSize?.height ?? 240 }
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
      <aside style={{ background: "#ffffff", borderLeft: "1px solid #d0d7de", padding: 20 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Inspector</h2>
        <p style={{ color: "#57606a", fontSize: 13 }}>Select a GTSX component.</p>
      </aside>
    )
  }

  const selectedCase = selectedStudioCaseName(props.workspace, props.component)
  const selectedViewportPreset = props.workspace.selectedViewportPresetByCoordinate[props.component.coordinate] ?? "content"
  const instances = runtimeInstancesForSelectedComponent(props.manifest, props.workspace, props.frameStates)
  const selectedValues = selectedRuntimeValuesSnapshot(props.manifest, props.workspace, props.frameStates)

  return (
    <aside style={{ background: "#ffffff", borderLeft: "1px solid #d0d7de", padding: 20 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 16px" }}>Inspector</h2>
      <section style={{ display: "grid", gap: 4, marginBottom: 20 }}>
        <strong>{props.component.componentName}</strong>
        <code style={{ color: "#57606a", fontSize: 12 }}>{props.component.coordinate}</code>
      </section>
      <section>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Cases</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {props.component.cases.map((testCase) => (
            <button
              data-gtsx-case-control={testCase.name}
              key={testCase.name}
              onClick={() => props.onChangeCase?.(props.component!, testCase.name)}
              style={{
                background: selectedCase === testCase.name ? "#ddf4ff" : "#ffffff",
                border: "1px solid #d0d7de",
                borderColor: selectedCase === testCase.name ? "#0969da" : "#d0d7de",
                borderRadius: 8,
                color: "#24292f",
                cursor: props.onChangeCase ? "pointer" : "default",
                padding: "8px 10px",
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
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Viewport</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {(["content", "phone", "tablet", "desktop"] satisfies StudioViewportPreset[]).map((preset) => (
            <button
              data-gtsx-viewport-control={preset}
              key={preset}
              onClick={() => props.onChangeViewportPreset?.(props.component!, preset)}
              style={{
                background: selectedViewportPreset === preset ? "#ddf4ff" : "#ffffff",
                border: "1px solid #d0d7de",
                borderColor: selectedViewportPreset === preset ? "#0969da" : "#d0d7de",
                borderRadius: 8,
                color: "#24292f",
                cursor: props.onChangeViewportPreset ? "pointer" : "default",
                padding: "8px 10px",
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
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Instances</h3>
        {instances.length > 0 ? (
          <ol style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {instances.map((instance) => (
              <li
                data-gtsx-runtime-instance-id={instance.boundaryId}
                key={instance.boundaryId}
                style={{
                  background: "#f6f8fa",
                  border: "1px solid #d0d7de",
                  borderRadius: 8,
                  display: "grid",
                  gap: 4,
                  padding: "8px 10px",
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
                <span style={{ color: "#57606a", fontSize: 12 }}>Parent: {instance.parentPath.join(" > ") || "root"}</span>
                {instance.rect ? (
                  <span style={{ color: "#57606a", fontSize: 12 }}>
                    {instance.rect.width}x{instance.rect.height} at {instance.rect.x},{instance.rect.y}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ color: "#57606a", fontSize: 12, margin: 0 }}>No runtime instances reported yet.</p>
        )}
      </section>
      <section style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Values</h3>
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
                <p style={{ color: "#57606a", fontSize: 12, margin: 0 }}>No provider values reported.</p>
              )}
            </section>
          </div>
        ) : (
          <p style={{ color: "#57606a", fontSize: 12, margin: 0 }}>Select an instance to request runtime values.</p>
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
    const parentFrameState = frameStates?.[previewSessionId(parentComponent, parentCaseName)]
    return findBoundaryNodes(parentFrameState?.tree ?? [], parentCoordinate).flatMap((parentNode) =>
      parentNode.children
        .filter((child) => child.coordinate === selectedCoordinate)
        .map((child) => toRuntimeInstance(child, [parentCoordinate])),
    )
  }

  const selectedComponent = findManifestComponent(manifest, selectedCoordinate)
  if (!selectedComponent) return []

  const selectedCaseName = selectedStudioCaseName(workspace, selectedComponent)
  const selectedFrameState = frameStates?.[previewSessionId(selectedComponent, selectedCaseName)]
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
  const sourceFrameState = frameStates?.[previewSessionId(sourceComponent, sourceCaseName)]
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

function previewUrlForComponent(manifest: StudioManifest, component: StudioManifestComponent, caseName: string): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    sessionId: previewSessionId(component, caseName),
  })

  return `${manifest.routes.preview}?${params.toString()}`
}

function previewSessionId(component: StudioManifestComponent, caseName: string): string {
  return `${component.coordinate}:${caseName}`
}

function currentPreviewSessionIds(workspace: StudioWorkspaceState): Set<string> {
  return new Set(
    workspace.columns.flatMap((column) =>
      column.components.flatMap((component) => {
        const caseName = selectedStudioCaseName(workspace, component)
        return caseName !== "No cases" ? [previewSessionId(component, caseName)] : []
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
