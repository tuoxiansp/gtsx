"use client"

import React from "react"
import { createGScope, type GCases } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioCanvasWheel,
  applyStudioCardSelectionAction,
  canvasViewportPresetForWorkspace,
  findManifestComponent,
  previewCaseOverridesForComponent,
  previewSessionId,
  selectedStudioCaseName,
  visibleWorkspaceComponents,
  type StudioCanvasTransform,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import ComponentCard from "./ComponentCard.g"
import FileGroupLink from "./FileGroupLink.g"
import SelectedComponentCasesSidebar from "./SelectedComponentCasesSidebar.g"
import ViewportPresetTabs from "./ViewportPresetTabs.g"

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
  onSelectComponent?: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  urlWarning?: string
}

type StudioWorkspaceViewScope = {
  canvas: StudioCanvasTransform
  canvasViewportPreset: StudioViewportPreset
  onCanvasPointerCancel: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerDown: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerMove: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerUp: React.PointerEventHandler<HTMLDivElement>
  onChangeSelection?: (selection: string) => void
  onSelectCard: (
    component: StudioManifestComponent,
    frameState: StudioPreviewFrameState | undefined,
    source: "keyboard" | "pointer",
  ) => void
  onViewportPresetChange: (preset: StudioViewportPreset) => void
  selected: { id: string; components: StudioManifestComponent[] }
  selectedCardCoordinate?: string
  selectedCardComponent?: StudioManifestComponent
  selectedCaseName?: string
  setCanvasViewportElement: (element: HTMLDivElement | null) => void
}

function useRealStudioWorkspaceViewScope(props: StudioWorkspaceViewProps): StudioWorkspaceViewScope {
  const selected = resolveSelection(props.manifest, props.selection)
  const [selectedCardCoordinate, setSelectedCardCoordinate] = React.useState<string | undefined>()
  const canvasViewportPreset = canvasViewportPresetForWorkspace(props.workspace)
  const [canvas, setCanvas] = React.useState<StudioCanvasTransform>({ x: 40, y: 40, scale: 1 })
  const panRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [canvasViewportElement, setCanvasViewportElement] = React.useState<HTMLDivElement | null>(null)
  const selectedCardComponent = selectedCardCoordinate ? findManifestComponent(props.manifest, selectedCardCoordinate) : undefined
  const selectedCaseName = selectedCardComponent ? selectedStudioCaseName(props.workspace, selectedCardComponent) : undefined

  React.useEffect(() => {
    setSelectedCardCoordinate(undefined)
  }, [props.selection])

  React.useEffect(() => {
    if (!canvasViewportElement) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvasViewportElement.getBoundingClientRect()
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

    canvasViewportElement.addEventListener("wheel", handleWheel, { passive: false })
    return () => canvasViewportElement.removeEventListener("wheel", handleWheel)
  }, [canvasViewportElement])

  return {
    canvas,
    canvasViewportPreset,
    onCanvasPointerCancel(event) {
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    },
    onCanvasPointerDown(event) {
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
    },
    onCanvasPointerMove(event) {
      const pan = panRef.current
      if (!pan || pan.pointerId !== event.pointerId) return
      setCanvas((current) => ({
        ...current,
        x: pan.originX + event.clientX - pan.startX,
        y: pan.originY + event.clientY - pan.startY,
      }))
    },
    onCanvasPointerUp(event) {
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null
    },
    onChangeSelection: props.onChangeSelection
      ? (nextSelection) => {
          setSelectedCardCoordinate((current) => applyStudioCardSelectionAction(current, { type: "clear" }))
          props.onChangeSelection?.(nextSelection)
        }
      : undefined,
    onSelectCard(component, frameState, source) {
      setSelectedCardCoordinate((current) =>
        applyStudioCardSelectionAction(current, {
          type: "activate-card",
          coordinate: component.coordinate,
          source,
        }),
      )
      props.onSelectComponent?.(component, frameState)
    },
    onViewportPresetChange(preset) {
      if (props.onChangeCanvasViewportPreset) {
        props.onChangeCanvasViewportPreset(preset)
      } else {
        for (const component of visibleWorkspaceComponents(props.workspace)) props.onChangeViewportPreset?.(component, preset)
      }
    },
    selected,
    selectedCardComponent,
    selectedCardCoordinate,
    selectedCaseName,
    setCanvasViewportElement,
  }
}

const useStudioWorkspaceViewScope = createGScope(useRealStudioWorkspaceViewScope)

export default function StudioWorkspaceView(props: StudioWorkspaceViewProps) {
  const scope = useStudioWorkspaceViewScope(props)

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "210px minmax(0, 1fr)",
        height: "100vh",
        overflow: "hidden",
        background: "#f5f6f8",
        color: "#1f2328",
        fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
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
              onChangeSelection={scope.onChangeSelection}
              selectedId={scope.selected.id}
            />
          ))}
        </nav>
      </aside>

      <section style={{ display: "grid", minHeight: 0, minWidth: 0 }}>
        <div
          aria-label="GTSX canvas viewport"
          data-gtsx-canvas-viewport
          onPointerDown={scope.onCanvasPointerDown}
          onPointerMove={scope.onCanvasPointerMove}
          onPointerUp={scope.onCanvasPointerUp}
          onPointerCancel={scope.onCanvasPointerCancel}
          ref={scope.setCanvasViewportElement}
          style={{
            backgroundColor: "#f5f6f8",
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(31,35,40,0.10) 1px, transparent 0)",
            backgroundSize: "24px 24px",
            cursor: "grab",
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
          <ViewportPresetTabs floating onChange={scope.onViewportPresetChange} selectedPreset={scope.canvasViewportPreset} />
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
              transform: `translate(${scope.canvas.x}px, ${scope.canvas.y}px) scale(${scope.canvas.scale})`,
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
                      onSelect={scope.onSelectCard}
                      selected={scope.selectedCardCoordinate === component.coordinate}
                      selectedCaseName={caseName}
                      viewportPreset={scope.canvasViewportPreset}
                      workspace={props.workspace}
                    />
                  )
                })}
              </section>
            ))}
          </div>
          {scope.selectedCardComponent && scope.selectedCaseName ? (
            <SelectedComponentCasesSidebar
              component={scope.selectedCardComponent}
              manifest={props.manifest}
              onChangeCase={props.onChangeCase}
              selectedCaseName={scope.selectedCaseName}
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

StudioWorkspaceView.cases = {
  multiExportFile: {
    props: {
      manifest: {
        version: 1,
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        preview: {
          urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
          allUrlTemplate: "/gtsx?entry={entry}{gcase}",
        },
        files: [
          {
            path: "src/MultiExport.g.tsx",
            groupId: "file:src/MultiExport.g.tsx",
            components: [
              {
                coordinate: "src/MultiExport.g.tsx#NamedBadge",
                filePath: "src/MultiExport.g.tsx",
                exportName: "NamedBadge",
                componentName: "NamedBadge",
                mode: "pure",
                cases: [{ kind: "pure", name: "ready" }],
                providers: {},
                diagnostics: [],
              },
            ],
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
      workspace: {
        canvasViewportPreset: "tablet",
        columns: [
          {
            components: [
              {
                coordinate: "src/MultiExport.g.tsx#NamedBadge",
                filePath: "src/MultiExport.g.tsx",
                exportName: "NamedBadge",
                componentName: "NamedBadge",
                mode: "pure",
                cases: [{ kind: "pure", name: "ready" }],
                providers: {},
                diagnostics: [],
              },
            ],
          },
        ],
        selectedCaseByCoordinate: {},
        selectedCoordinatePath: [],
        selectedRuntimeInstanceByCoordinate: {},
        selectedViewportPresetByCoordinate: {},
      },
    },
    scope: {
      canvas: { x: 40, y: 40, scale: 1 },
      canvasViewportPreset: "tablet",
      onCanvasPointerCancel() {},
      onCanvasPointerDown() {},
      onCanvasPointerMove() {},
      onCanvasPointerUp() {},
      onSelectCard() {},
      onViewportPresetChange() {},
      selected: { id: "file:src/MultiExport.g.tsx", components: [] },
      setCanvasViewportElement() {},
    },
  },
} satisfies GCases<StudioWorkspaceViewProps, StudioWorkspaceViewScope>

function resolveSelection(manifest: StudioManifest, selection: string | undefined): { id: string; components: StudioManifestComponent[] } {
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
