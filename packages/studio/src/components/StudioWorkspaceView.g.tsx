"use client"

import React from "react"
import { createGScopeHook, type GCases } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioCanvasWheel,
  applyStudioCardSelectionAction,
  canvasViewportPresetForWorkspace,
  computeStudioColumnLayout,
  defaultStudioCanvasTransform,
  findManifestComponent,
  mergeStudioPreviewFrameState,
  previewSessionId,
  revealStudioCanvasRect,
  resolveStudioSelection,
  selectedStudioCaseName,
  studioPreviewCacheKey,
  type StudioPreviewCacheEntry,
  type StudioCanvasScreenRect,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
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
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  setCanvasSurfaceElement: (element: HTMLDivElement | null) => void
  setCardElement: (columnIndex: number, coordinate: string, element: HTMLDivElement | null) => void
  setColumnElement: (columnIndex: number, element: HTMLElement | null) => void
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
  columnLayoutByIndex: Record<number, StudioColumnLayout>
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const canvasWheelExemptSelector = "[data-gtsx-canvas-wheel-exempt]"
const studioColumnGap = 40
const studioCanvasRevealMargin = 24

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
  const [columnLayoutByIndex, setColumnLayoutByIndex] = React.useState<Record<number, StudioColumnLayout>>({})
  const cardElements = React.useRef(new Map<string, HTMLDivElement>())
  const columnCardElements = React.useRef(new Map<string, HTMLDivElement>())
  const columnElements = React.useRef(new Map<number, HTMLElement>())
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

  const setCardElement = React.useCallback((columnIndex: number, coordinate: string, element: HTMLDivElement | null) => {
    const key = columnCardElementKey(columnIndex, coordinate)
    if (element) {
      cardElements.current.set(coordinate, element)
      columnCardElements.current.set(key, element)
    } else {
      if (cardElements.current.get(coordinate) === columnCardElements.current.get(key)) cardElements.current.delete(coordinate)
      columnCardElements.current.delete(key)
    }
  }, [])

  const setColumnElement = React.useCallback((columnIndex: number, element: HTMLElement | null) => {
    if (element) {
      columnElements.current.set(columnIndex, element)
    } else {
      columnElements.current.delete(columnIndex)
    }
  }, [])

  const revealCardOnCanvas = React.useCallback(
    (coordinate: string) => {
      if (!canvasViewportElement) return
      const cardElement = cardElements.current.get(coordinate)
      if (!cardElement) return

      const caseSidebarElement = canvasViewportElement.querySelector("[data-gtsx-case-sidebar]")
      const blockerRects: StudioCanvasScreenRect[] =
        caseSidebarElement instanceof Element ? [domRectToStudioCanvasScreenRect(caseSidebarElement.getBoundingClientRect())] : []
      const nextCanvas = revealStudioCanvasRect(canvasRef.current, {
        blockerRects,
        margin: studioCanvasRevealMargin,
        rect: domRectToStudioCanvasScreenRect(cardElement.getBoundingClientRect()),
        viewportRect: domRectToStudioCanvasScreenRect(canvasViewportElement.getBoundingClientRect()),
      })
      if (nextCanvas !== canvasRef.current) setCanvas(() => nextCanvas)
    },
    [canvasViewportElement, setCanvas],
  )

  const scheduleRevealCardOnCanvas = React.useCallback(
    (coordinate: string) => {
      revealCardOnCanvas(coordinate)
      if (typeof window === "undefined") return
      window.requestAnimationFrame(() => revealCardOnCanvas(coordinate))
    },
    [revealCardOnCanvas],
  )

  useStudioLayoutEffect(() => {
    if (!canvasSurfaceElement) return

    const nextMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement> = {}

    props.workspace.columns.forEach((column, columnIndex) => {
      const columnElement = columnElements.current.get(columnIndex)
      if (!columnElement) return

      const columnRect = columnElement.getBoundingClientRect()
      const cardRectsByCoordinate: Record<string, StudioCanvasScreenRect> = {}
      for (const component of column.components) {
        const cardElement = columnCardElements.current.get(columnCardElementKey(columnIndex, component.coordinate))
        if (!cardElement) continue
        cardRectsByCoordinate[component.coordinate] = domRectToLocalStudioCanvasScreenRect(
          cardElement.getBoundingClientRect(),
          columnRect,
          canvasRef.current.scale,
        )
      }
      nextMeasurementsByIndex[columnIndex] = {
        cardRectsByCoordinate,
        height: columnRect.height / canvasRef.current.scale,
      }
    })

    const nextLayoutByIndex = computeStudioColumnLayout({
      columns: props.workspace.columns.map((column) => ({
        componentCoordinates: column.components.map((component) => component.coordinate),
        parentCoordinate: column.parentCoordinate,
      })),
      margin: studioColumnGap,
      measurementsByIndex: nextMeasurementsByIndex,
    })

    setColumnLayoutByIndex((current) => (sameColumnLayoutRecord(current, nextLayoutByIndex) ? current : nextLayoutByIndex))
  }, [canvas.scale, canvasSurfaceElement, canvasViewportPreset, props.frameStates, props.previewCache, props.workspace.columns])

  return {
    canvas,
    canvasViewportPreset,
    columnLayoutByIndex,
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
    onChangeCase: props.onChangeCase
      ? (component, caseName, options) => {
          props.onChangeCase?.(component, caseName, options)
          scheduleRevealCardOnCanvas(component.coordinate)
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
    setColumnElement,
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
              display: "block",
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
                data-gtsx-column-layout-x={scope.columnLayoutByIndex[columnIndex]?.x ?? 0}
                data-gtsx-column-layout-y={scope.columnLayoutByIndex[columnIndex]?.y ?? 0}
                data-gtsx-column-parent-coordinate={column.parentCoordinate}
                key={columnIndex}
                ref={(element) => scope.setColumnElement(columnIndex, element)}
                style={{
                  display: "grid",
                  gap: 10,
                  left: scope.columnLayoutByIndex[columnIndex]?.x ?? 0,
                  position: "absolute",
                  top: scope.columnLayoutByIndex[columnIndex]?.y ?? 0,
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
                      ref={(element) => scope.setCardElement(columnIndex, component.coordinate, element)}
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
              onChangeCase={scope.onChangeCase}
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

function domRectToStudioCanvasScreenRect(rect: DOMRect): StudioCanvasScreenRect {
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  }
}

function domRectToLocalStudioCanvasScreenRect(rect: DOMRect, originRect: DOMRect, scale: number): StudioCanvasScreenRect {
  return {
    bottom: (rect.bottom - originRect.top) / scale,
    left: (rect.left - originRect.left) / scale,
    right: (rect.right - originRect.left) / scale,
    top: (rect.top - originRect.top) / scale,
  }
}

function columnCardElementKey(columnIndex: number, coordinate: string): string {
  return `${columnIndex}\n${coordinate}`
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
      columnLayoutByIndex: {},
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
      setColumnElement() {},
    },
  },
} satisfies GCases<StudioWorkspaceViewProps, StudioWorkspaceViewScope>

function sameColumnLayoutRecord(left: Record<number, StudioColumnLayout>, right: Record<number, StudioColumnLayout>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    const leftLayout = left[Number(key)]
    const rightLayout = right[Number(key)]
    return leftLayout?.x === rightLayout?.x && leftLayout?.y === rightLayout?.y
  })
}
