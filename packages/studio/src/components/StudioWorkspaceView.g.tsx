"use client"

import React from "react"
import { createGScopeHook, type GCases } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioCanvasWheel,
  applyStudioCardSelectionAction,
  canvasViewportPresetForWorkspace,
  defaultStudioCanvasTransform,
  findManifestComponent,
  mergeStudioPreviewFrameState,
  previewSessionId,
  resolveStudioSelection,
  selectedStudioCaseName,
  studioPreviewCacheKey,
  type StudioPreviewCacheEntry,
  visibleWorkspaceComponents,
  type StudioCanvasTransform,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import ComponentCard from "./ComponentCard.g"
import SelectedComponentCasesSidebar from "./SelectedComponentCasesSidebar.g"
import ViewportPresetTabs from "./ViewportPresetTabs.g"

export type StudioWorkspaceViewProps = {
  canvas?: StudioCanvasTransform
  manifest: StudioManifest
  workspace: StudioWorkspaceState
  selection?: string
  previewCache?: Record<string, StudioPreviewCacheEntry>
  frameStates?: Record<string, StudioPreviewFrameState>
  onChangeSelection?: (selection: string) => void
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  onChangeCanvasViewportPreset?: (preset: StudioViewportPreset) => void
  onChangeCanvas?: (canvas: StudioCanvasTransform) => void
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
  setCanvasSurfaceElement: (element: HTMLDivElement | null) => void
  setCardElement: (coordinate: string, element: HTMLDivElement | null) => void
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
  columnOffsetsByIndex: Record<number, number>
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const canvasWheelExemptSelector = "[data-gtsx-canvas-wheel-exempt]"

function shouldHandleCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(canvasWheelExemptSelector))
}

function useRealStudioWorkspaceViewScope(props: StudioWorkspaceViewProps): StudioWorkspaceViewScope {
  const selected = resolveStudioSelection(props.manifest, props.selection)
  const [selectedCardCoordinate, setSelectedCardCoordinate] = React.useState<string | undefined>()
  const canvasViewportPreset = canvasViewportPresetForWorkspace(props.workspace)
  const [uncontrolledCanvas, setUncontrolledCanvas] = React.useState<StudioCanvasTransform>(() => defaultStudioCanvasTransform())
  const canvas = props.canvas ?? uncontrolledCanvas
  const canvasRef = React.useRef(canvas)
  const panRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [canvasViewportElement, setCanvasViewportElement] = React.useState<HTMLDivElement | null>(null)
  const [canvasSurfaceElement, setCanvasSurfaceElement] = React.useState<HTMLDivElement | null>(null)
  const [columnOffsetsByIndex, setColumnOffsetsByIndex] = React.useState<Record<number, number>>({})
  const cardElements = React.useRef(new Map<string, HTMLDivElement>())
  const selectedCardComponent = selectedCardCoordinate ? findManifestComponent(props.manifest, selectedCardCoordinate) : undefined
  const selectedCaseName = selectedCardComponent ? selectedStudioCaseName(props.workspace, selectedCardComponent) : undefined

  React.useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

  const setCanvas = React.useCallback(
    (updater: (current: StudioCanvasTransform) => StudioCanvasTransform) => {
      const next = updater(canvasRef.current)
      canvasRef.current = next
      if (props.onChangeCanvas) {
        props.onChangeCanvas(next)
      } else {
        setUncontrolledCanvas(next)
      }
    },
    [props.onChangeCanvas],
  )

  React.useEffect(() => {
    setSelectedCardCoordinate(undefined)
  }, [props.selection])

  React.useEffect(() => {
    if (!canvasViewportElement) return

    const handleWheel = (event: WheelEvent) => {
      if (!shouldHandleCanvasWheelTarget(event.target)) return
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
  }, [canvasViewportElement, setCanvas])

  const setCardElement = React.useCallback((coordinate: string, element: HTMLDivElement | null) => {
    if (element) {
      cardElements.current.set(coordinate, element)
    } else {
      cardElements.current.delete(coordinate)
    }
  }, [])

  useStudioLayoutEffect(() => {
    if (!canvasSurfaceElement) return

    const surfaceTop = canvasSurfaceElement.getBoundingClientRect().top
    const nextOffsets: Record<number, number> = {}

    props.workspace.columns.forEach((column, columnIndex) => {
      if (columnIndex === 0 || !column.parentCoordinate) return

      const parentElement = cardElements.current.get(column.parentCoordinate)
      if (!parentElement) return

      const parentTop = parentElement.getBoundingClientRect().top
      nextOffsets[columnIndex] = Math.max(0, Math.round((parentTop - surfaceTop) / canvasRef.current.scale))
    })

    setColumnOffsetsByIndex((current) => (sameNumberRecord(current, nextOffsets) ? current : nextOffsets))
  }, [canvas.scale, canvasSurfaceElement, canvasViewportPreset, props.frameStates, props.previewCache, props.workspace.columns])

  return {
    canvas,
    canvasViewportPreset,
    columnOffsetsByIndex,
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
        originX: canvasRef.current.x,
        originY: canvasRef.current.y,
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
    setCanvasSurfaceElement,
    setCanvasViewportElement,
    setCardElement,
  }
}

const useStudioWorkspaceViewScope = createGScopeHook(useRealStudioWorkspaceViewScope)

export default function Studio(props: StudioWorkspaceViewProps) {
  const scope = useStudioWorkspaceViewScope(props)

  return (
    <main
      style={{
        display: "grid",
        height: "100vh",
        overflow: "hidden",
        background: "#f5f6f8",
        color: "#1f2328",
        fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
      }}
    >
      <section style={{ display: "grid", minHeight: 0, minWidth: 0 }}>
        <div
          aria-label="GTSX Studio canvas viewport"
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
          {props.urlWarning ? (
            <p
              role="status"
              style={{
                background: "#fff8c5",
                border: "1px solid #d4a72c",
                borderRadius: 8,
                color: "#5a1e02",
                fontSize: 12,
                left: 16,
                lineHeight: 1.45,
                margin: 0,
                maxWidth: 280,
                padding: "8px 10px",
                position: "absolute",
                top: 16,
                zIndex: 3,
              }}
            >
              {props.urlWarning}
            </p>
          ) : null}
          <div
            data-gtsx-canvas-surface
            ref={scope.setCanvasSurfaceElement}
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
              <section
                data-gtsx-column-index={columnIndex}
                data-gtsx-column-parent-coordinate={column.parentCoordinate}
                key={columnIndex}
                style={{
                  display: "grid",
                  gap: 10,
                  marginTop: columnIndex === 0 ? 0 : (scope.columnOffsetsByIndex[columnIndex] ?? 0),
                  width: "max-content",
                }}
              >
                {column.components.map((component) => {
                  const caseName = selectedStudioCaseName(props.workspace, component)
                  const sessionId = previewSessionId(component, caseName, scope.canvasViewportPreset)
                  const cacheKey = studioPreviewCacheKey(component, caseName, scope.canvasViewportPreset)
                  const frameState = mergeStudioPreviewFrameState(
                    sessionId,
                    props.frameStates?.[sessionId],
                    props.previewCache?.[cacheKey]?.frameState,
                  )
                  return (
                    <div
                      key={component.coordinate}
                      ref={(element) => scope.setCardElement(component.coordinate, element)}
                      style={{ display: "grid" }}
                    >
                      <ComponentCard
                        component={component}
                        frameState={frameState}
                        manifest={props.manifest}
                        onPreviewFrameMount={props.onPreviewFrameMount}
                        onSelect={scope.onSelectCard}
                        selected={scope.selectedCardCoordinate === component.coordinate}
                        selectedCaseName={caseName}
                        viewportPreset={scope.canvasViewportPreset}
                      />
                    </div>
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
              previewCache={props.previewCache}
              selectedCaseName={scope.selectedCaseName}
              viewportPreset={scope.canvasViewportPreset}
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

Studio.cases = {
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
      columnOffsetsByIndex: {},
      onCanvasPointerCancel() {},
      onCanvasPointerDown() {},
      onCanvasPointerMove() {},
      onCanvasPointerUp() {},
      onSelectCard() {},
      onViewportPresetChange() {},
      selected: { id: "file:src/MultiExport.g.tsx", components: [] },
      setCanvasSurfaceElement() {},
      setCanvasViewportElement() {},
      setCardElement() {},
    },
  },
} satisfies GCases<StudioWorkspaceViewProps, StudioWorkspaceViewScope>

function sameNumberRecord(left: Record<number, number>, right: Record<number, number>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => left[Number(key)] === right[Number(key)])
}
