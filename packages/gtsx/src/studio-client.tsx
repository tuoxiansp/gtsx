"use client"

import React from "react"

import { G_PREVIEW_PROTOCOL_VERSION, type GPreviewProtocolMessage } from "./preview-protocol.js"
import type { StudioManifest, StudioManifestComponent, StudioManifestFile } from "./studio-manifest.js"
import type { GBoundaryTreeNode } from "./runtime.js"

export type StudioShellProps = {
  manifest: StudioManifest
  selection?: string
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
}

export type StudioWorkspaceColumn = {
  components: StudioManifestComponent[]
}

export type StudioWorkspaceState = {
  columns: StudioWorkspaceColumn[]
  selectedCaseByCoordinate: Record<string, string>
  selectedCoordinatePath: string[]
}

export type StudioWorkspaceViewProps = {
  manifest: StudioManifest
  workspace: StudioWorkspaceState
  selection?: string
  frameStates?: Record<string, StudioPreviewFrameState>
  onChangeCase?: (component: StudioManifestComponent, caseName: string) => void
  onSelectComponent?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
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

  return { ...state, error: message.error }
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
  const [workspace, setWorkspace] = React.useState(() => createStudioWorkspaceState(props.manifest, props.selection))
  const [frameStates, setFrameStates] = React.useState<Record<string, StudioPreviewFrameState>>({})
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || !sessionIds.has(message.sessionId)) return

      setFrameStates((current) => applyStudioPreviewMessageToFrameStates(current, message, sessionIds))
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [sessionIds])

  return (
    <StudioWorkspaceView
      frameStates={frameStates}
      manifest={props.manifest}
      onSelectComponent={(component, frameState) => {
        setWorkspace((current) => selectStudioComponent(current, props.manifest, component.coordinate, frameState?.tree ?? []))
      }}
      onChangeCase={(component, caseName) => {
        setWorkspace((current) => changeStudioComponentCase(current, component.coordinate, caseName))
      }}
      selection={props.selection}
      workspace={workspace}
    />
  )
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
                    onSelect={props.onSelectComponent}
                    selectedCaseName={caseName}
                  />
                )
              })}
            </section>
          ))}
        </div>
      </section>

      <StudioInspector
        component={selectedInspectorComponent(props.manifest, props.workspace)}
        onChangeCase={props.onChangeCase}
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
  onSelect?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  selectedCaseName: string
}) {
  const defaultCase = props.selectedCaseName
  const previewError = getPreviewError(props.component)

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
      {previewError ? (
        <PreviewError error={previewError} />
      ) : (
        <>
          <iframe
            src={previewUrlForComponent(props.manifest, props.component, defaultCase)}
            style={{ background: "#ffffff", border: "1px solid #d0d7de", borderRadius: 8, height: 240, width: "100%" }}
            title={`${props.component.componentName} preview`}
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

function PreviewError(props: { error: string }) {
  return (
    <div
      role="status"
      style={{ background: "#fff8c5", border: "1px solid #d4a72c", borderRadius: 8, color: "#5a1e02", padding: 12 }}
    >
      <strong>Preview unavailable</strong>
      <p style={{ margin: "6px 0 0" }}>{props.error}</p>
    </div>
  )
}

function StudioInspector(props: {
  component: StudioManifestComponent | undefined
  onChangeCase?: (component: StudioManifestComponent, caseName: string) => void
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
    </aside>
  )
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
