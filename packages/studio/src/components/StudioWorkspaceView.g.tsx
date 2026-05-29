"use client"

import React from "react"
import { createGScopeHook, type GCases } from "@gtsx/core"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioCardSelectionAction,
  canvasViewportPresetForWorkspace,
  revealStudioCanvasRect,
  resolveStudioSelection,
  selectedStudioCaseName,
  type StudioPreviewCacheEntry,
  type StudioColumnLayout,
  visibleWorkspaceComponents,
  type StudioCanvasTransform,
  type StudioComponentSelectionOptions,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import type { StudioPreviewRenderQueueOptions } from "../preview-render-queue"
import {
  createStudioPreviewRenderSessionStore,
  StudioPreviewRenderSessionStoreProvider,
  type StudioPreviewRenderSessionStore,
} from "../preview-render-session-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import {
  domRectToStudioCanvasScreenRect,
  studioCanvasTransformStyle,
  studioComponentPathForColumn,
  studioPathKey,
} from "../studio-canvas-geometry"
import {
  createStudioPreviewRenderObservation,
  type StudioPreviewRenderObservationSnapshot,
  type StudioPreviewRenderQueueDebugObservationInput,
} from "../studio-preview-render-observation"
import { useStudioCanvasController } from "../use-studio-canvas-controller"
import { useStudioCanvasLayout } from "../use-studio-canvas-layout"
import { useStudioPreviewRenderScheduler } from "../use-studio-preview-render-scheduler"
import StudioComponentCardSlot from "./StudioComponentCardSlot"
import ViewportPresetTabs from "./ViewportPresetTabs.g"
import type { StudioPreviewGeometryCacheStore } from "../preview-geometry-cache-store"

export type StudioWorkspaceViewProps = {
  canvas?: StudioCanvasTransform
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  manifest: StudioManifest
  workspace: StudioWorkspaceState
  selection?: string
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewCacheReady?: boolean
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  previewRenderQueue?: StudioPreviewRenderQueueOptions
  frameStates?: Record<string, StudioPreviewFrameState>
  onChangeSelection?: (selection: string) => void
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  onChangeCanvasViewportPreset?: (preset: StudioViewportPreset) => void
  onChangeCanvas?: (canvas: StudioCanvasTransform) => void
  onChangeViewportPreset?: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  onSelectComponent?: (
    component: StudioManifestComponent,
    caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
    options?: StudioComponentSelectionOptions,
  ) => void
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
  setCardElement: (columnIndex: number, coordinate: string, element: HTMLDivElement | null) => void
  setColumnElement: (columnIndex: number, element: HTMLElement | null) => void
  onSelectCard: (
    component: StudioManifestComponent,
    caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
    columnIndex: number,
    source: "keyboard" | "pointer",
  ) => void
  onViewportPresetChange: (preset: StudioViewportPreset) => void
  onPreviewGeometryChange: () => void
  previewRenderSessionStore: StudioPreviewRenderSessionStore
  casePreviewScale: number
  selected: { id: string; components: StudioManifestComponent[] }
  selectedCardPathKey?: string
  setCanvasViewportElement: (element: HTMLDivElement | null) => void
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  renderObservationSnapshot?: StudioPreviewRenderObservationSnapshot
  renderExpansionCenterPulse?: { id: number; x: number; y: number }
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const canvasWheelExemptSelector = "[data-gtsx-canvas-wheel-exempt]"
const studioCanvasRevealMargin = 24

function shouldHandleCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(canvasWheelExemptSelector))
}

function shouldClearStudioCanvasSelectionForPointerTarget(target: EventTarget | null): boolean {
  return typeof Element === "undefined" || !(target instanceof Element) || !target.closest("a,button,iframe")
}

function useRealStudioWorkspaceViewScope(props: StudioWorkspaceViewProps): StudioWorkspaceViewScope {
  const selected = resolveStudioSelection(props.manifest, props.selection)
  const [selectedCardPathKey, setSelectedCardPathKey] = React.useState<string | undefined>()
  const canvasViewportPreset = canvasViewportPresetForWorkspace(props.workspace)
  const previewRenderSessionStore = React.useMemo(() => createStudioPreviewRenderSessionStore(), [])
  const canvasViewportPresetRef = React.useRef(canvasViewportPreset)
  const frameStatesRef = React.useRef(props.frameStates)
  const flushPreviewRenderRef = React.useRef<(nextCanvas?: StudioCanvasTransform, options?: { includeBuffer?: boolean }) => void>(
    () => {},
  )
  const requestPreviewRenderRef = React.useRef<(nextCanvas?: StudioCanvasTransform) => void>(() => {})
  const [renderExpansionCenterPulse, setRenderExpansionCenterPulse] = React.useState<
    { id: number; x: number; y: number } | undefined
  >()
  const [renderObservationSnapshot, setRenderObservationSnapshot] = React.useState<
    StudioPreviewRenderObservationSnapshot | undefined
  >()
  const onSelectComponentRef = React.useRef(props.onSelectComponent)
  const previewRenderObservationRef = React.useRef(
    createStudioPreviewRenderObservation({
      now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    }),
  )
  const previewRenderQueueRef = React.useRef(props.previewRenderQueue)
  const requestCanvasPreviewRenderRef = React.useRef<(nextCanvas: StudioCanvasTransform) => void>(() => {})
  const workspaceRef = React.useRef(props.workspace)
  canvasViewportPresetRef.current = canvasViewportPreset
  frameStatesRef.current = props.frameStates
  onSelectComponentRef.current = props.onSelectComponent
  previewRenderQueueRef.current = props.previewRenderQueue
  workspaceRef.current = props.workspace

  const canvasController = useStudioCanvasController({
    canvas: props.canvas,
    onCanvasChange: props.onChangeCanvas,
    onCanvasMove(nextCanvas) {
      requestCanvasPreviewRenderRef.current(nextCanvas)
    },
    onCanvasPanEnd() {
      flushPreviewRenderRef.current(undefined, { includeBuffer: true })
    },
    shouldHandleWheelTarget: shouldHandleCanvasWheelTarget,
  })

  const handleLayoutMeasured = React.useCallback(() => {
    requestPreviewRenderRef.current(canvasController.canvasRef.current)
  }, [canvasController.canvasRef])

  const layout = useStudioCanvasLayout({
    canvasRef: canvasController.canvasRef,
    canvasSurfaceElement: canvasController.canvasSurfaceElement,
    canvasViewportPreset,
    frameStates: props.frameStates,
    onLayoutMeasured: handleLayoutMeasured,
    previewCache: props.previewCache,
    previewGeometryStore: props.previewGeometryStore,
    workspace: props.workspace,
  })

  const { flushPreviewRender, requestCanvasPreviewRender, requestPreviewRender } = useStudioPreviewRenderScheduler({
    canvasRef: canvasController.canvasRef,
    canvasViewportElement: canvasController.canvasViewportElement,
    canvasViewportPresetRef,
    columnLayoutByIndexRef: layout.columnLayoutByIndexRef,
    columnMeasurementsByIndexRef: layout.columnMeasurementsByIndexRef,
    frameStatesRef,
    previewGeometryStore: props.previewGeometryStore,
    previewRenderQueueRef,
    previewRenderSessionStore,
    workspaceRef,
  })
  flushPreviewRenderRef.current = flushPreviewRender
  requestPreviewRenderRef.current = requestPreviewRender
  requestCanvasPreviewRenderRef.current = requestCanvasPreviewRender

  useStudioLayoutEffect(() => {
    requestPreviewRender(canvasController.canvasRef.current)
  }, [canvasController.canvasViewportElement, requestPreviewRender])

  React.useEffect(() => {
    requestPreviewRender(canvasController.canvasRef.current)
  }, [canvasViewportPreset, layout.layoutMeasurementKey, requestPreviewRender])

  React.useEffect(() => {
    if (props.previewGeometryStore) return
    requestPreviewRender(canvasController.canvasRef.current)
  }, [props.frameStates, props.previewGeometryStore, requestPreviewRender])

  React.useEffect(() => {
    if (!props.debugPreviewQueue || typeof window === "undefined") return

    const previewRenderObservation = previewRenderObservationRef.current
    let clearTimer = 0
    const publishObservationSnapshot = (snapshot: StudioPreviewRenderObservationSnapshot) => {
      setRenderObservationSnapshot(snapshot)
      document.documentElement.setAttribute("data-gtsx-preview-render-observation", JSON.stringify(snapshot))
      window.dispatchEvent(new CustomEvent("gtsx:preview-render-observation", { detail: snapshot }))
    }
    const clearPulse = () => {
      clearTimer = 0
      setRenderExpansionCenterPulse(undefined)
    }
    const handlePreviewQueueDebug = (event: Event) => {
      const detail = (event as CustomEvent<{
        renderExpansionCenterViewportPoint?: { x: number; y: number }
        showRenderExpansionCenterPulse?: boolean
      }>).detail
      publishObservationSnapshot(
        previewRenderObservation.observeQueueRun(
          detail as StudioPreviewRenderQueueDebugObservationInput,
        ),
      )
      if (!detail?.showRenderExpansionCenterPulse || !detail.renderExpansionCenterViewportPoint) return

      if (clearTimer) window.clearTimeout(clearTimer)
      setRenderExpansionCenterPulse({
        id: Date.now(),
        x: detail.renderExpansionCenterViewportPoint.x,
        y: detail.renderExpansionCenterViewportPoint.y,
      })
      clearTimer = window.setTimeout(clearPulse, 650)
    }
    const handlePreviewTiming = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; type?: string }>).detail
      if (
        !detail?.sessionId ||
        (detail.type !== "gtsx:ready" && detail.type !== "gtsx:error")
      ) {
        return
      }
      publishObservationSnapshot(previewRenderObservation.observePreviewTiming({ sessionId: detail.sessionId, type: detail.type }))
    }

    window.addEventListener("gtsx:preview-queue-debug", handlePreviewQueueDebug)
    window.addEventListener("gtsx:preview-timing", handlePreviewTiming)
    return () => {
      window.removeEventListener("gtsx:preview-queue-debug", handlePreviewQueueDebug)
      window.removeEventListener("gtsx:preview-timing", handlePreviewTiming)
      document.documentElement.removeAttribute("data-gtsx-preview-render-observation")
      if (clearTimer) window.clearTimeout(clearTimer)
    }
  }, [props.debugPreviewQueue])

  React.useEffect(() => {
    setSelectedCardPathKey(undefined)
  }, [props.selection])

  const revealCardOnCanvas = React.useCallback(
    (columnIndex: number, coordinate: string, options: { preserveVerticalCanvasPosition?: boolean } = {}) => {
      if (!canvasController.canvasViewportElement) return
      const cardElement = layout.getCardElement(columnIndex, coordinate)
      if (!cardElement) return

      const currentCanvas = canvasController.canvasRef.current
      const nextCanvas = revealStudioCanvasRect(currentCanvas, {
        margin: studioCanvasRevealMargin,
        rect: domRectToStudioCanvasScreenRect(cardElement.getBoundingClientRect()),
        viewportRect: domRectToStudioCanvasScreenRect(canvasController.canvasViewportElement.getBoundingClientRect()),
      })
      const revealCanvas = options.preserveVerticalCanvasPosition ? { ...nextCanvas, y: currentCanvas.y } : nextCanvas
      if (revealCanvas !== currentCanvas) canvasController.moveCanvas(() => revealCanvas)
    },
    [canvasController, layout.getCardElement],
  )

  const scheduleRevealCardOnCanvas = React.useCallback(
    (columnIndex: number, coordinate: string, options: { preserveVerticalCanvasPosition?: boolean } = {}) => {
      revealCardOnCanvas(columnIndex, coordinate, options)
      if (typeof window === "undefined") return
      window.requestAnimationFrame(() => revealCardOnCanvas(columnIndex, coordinate, options))
    },
    [revealCardOnCanvas],
  )

  const handleSelectCard = React.useCallback(
    (
      component: StudioManifestComponent,
      caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
      columnIndex: number,
      source: "keyboard" | "pointer",
    ) => {
      const nextSelectedCardPathKey = studioPathKey(studioComponentPathForColumn(workspaceRef.current, columnIndex, component.coordinate))
      setSelectedCardPathKey((current) => {
        const nextCoordinate = applyStudioCardSelectionAction(current === nextSelectedCardPathKey ? component.coordinate : undefined, {
          type: "activate-card",
          coordinate: component.coordinate,
          source,
        })
        return nextCoordinate ? nextSelectedCardPathKey : undefined
      })
      onSelectComponentRef.current?.(component, caseFrameStates, { columnIndex })
      scheduleRevealCardOnCanvas(columnIndex, component.coordinate, {
        preserveVerticalCanvasPosition: source === "pointer",
      })
    },
    [scheduleRevealCardOnCanvas],
  )

  return {
    canvas: canvasController.canvas,
    canvasViewportPreset,
    columnLayoutByIndex: layout.columnLayoutByIndex,
    onCanvasPointerCancel: canvasController.onCanvasPointerCancel,
    onCanvasPointerDown(event) {
      if (shouldClearStudioCanvasSelectionForPointerTarget(event.target)) setSelectedCardPathKey(undefined)
      canvasController.onCanvasPointerDown(event)
    },
    onCanvasPointerMove: canvasController.onCanvasPointerMove,
    onCanvasPointerUp: canvasController.onCanvasPointerUp,
    onChangeSelection: props.onChangeSelection
      ? (nextSelection) => {
          setSelectedCardPathKey(undefined)
          props.onChangeSelection?.(nextSelection)
        }
      : undefined,
    onSelectCard: handleSelectCard,
    onPreviewGeometryChange: layout.scheduleMeasurement,
    onViewportPresetChange(preset) {
      if (props.onChangeCanvasViewportPreset) {
        props.onChangeCanvasViewportPreset(preset)
      } else {
        for (const component of visibleWorkspaceComponents(props.workspace)) props.onChangeViewportPreset?.(component, preset)
      }
    },
    casePreviewScale: layout.casePreviewScale,
    renderObservationSnapshot,
    renderExpansionCenterPulse,
    previewRenderSessionStore,
    selected,
    selectedCardPathKey,
    setCanvasSurfaceElement: canvasController.setCanvasSurfaceElement,
    setCanvasViewportElement: canvasController.setCanvasViewportElement,
    setCardElement: layout.setCardElement,
    setColumnElement: layout.setColumnElement,
  }
}

const useStudioWorkspaceViewScope = createGScopeHook(useRealStudioWorkspaceViewScope)

export default function Studio(props: StudioWorkspaceViewProps) {
  const scope = useStudioWorkspaceViewScope(props)
  const previewCacheReady = props.previewCacheReady ?? true
  const initialCanvasSurfaceTransform = typeof window === "undefined" ? studioCanvasTransformStyle(scope.canvas) : undefined

  return (
    <StudioPreviewRenderSessionStoreProvider store={scope.previewRenderSessionStore}>
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
            aria-busy={previewCacheReady ? undefined : true}
            style={{
              backgroundColor: "#f5f6f8",
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(31,35,40,0.10) 1px, transparent 0)",
              backgroundSize: "24px 24px",
              cursor: "grab",
              height: "100%",
              minHeight: 0,
              overscrollBehavior: "none",
              overflow: "hidden",
              position: "relative",
              touchAction: "none",
            }}
            role="application"
            tabIndex={0}
          >
            <ViewportPresetTabs floating onChange={scope.onViewportPresetChange} selectedPreset={scope.canvasViewportPreset} />
            {scope.renderExpansionCenterPulse ? (
              <span
                aria-label="Preview render expansion center"
                data-gtsx-preview-render-expansion-center-pulse="true"
                key={scope.renderExpansionCenterPulse.id}
                style={{
                  background: "rgba(13,153,255,0.24)",
                  border: "2px solid #0d99ff",
                  borderRadius: 999,
                  boxShadow: "0 0 0 6px rgba(13,153,255,0.14)",
                  height: 18,
                  left: scope.renderExpansionCenterPulse.x,
                  pointerEvents: "none",
                  position: "absolute",
                  top: scope.renderExpansionCenterPulse.y,
                  transform: "translate(-50%, -50%)",
                  width: 18,
                  zIndex: 4,
                }}
              />
            ) : null}
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
            {props.debugPreviewQueue && scope.renderObservationSnapshot ? (
              <StudioPreviewRenderObservationPanel snapshot={scope.renderObservationSnapshot} />
            ) : null}
            {previewCacheReady ? (
              <div
                data-gtsx-canvas-surface
                ref={scope.setCanvasSurfaceElement}
                style={{
                  display: "block",
                  left: 0,
                  padding: "0 80px 80px 0",
                  position: "absolute",
                  top: 0,
                  ...(initialCanvasSurfaceTransform ? { transform: initialCanvasSurfaceTransform } : {}),
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
                      const componentPathKey = studioPathKey(
                        studioComponentPathForColumn(props.workspace, columnIndex, component.coordinate),
                      )
                      return (
                        <div
                          key={component.coordinate}
                          ref={(element) => scope.setCardElement(columnIndex, component.coordinate, element)}
                          style={{ display: "grid", justifySelf: "start", width: "max-content" }}
                        >
                          <StudioComponentCardSlot
                            casePreviewScale={scope.casePreviewScale}
                            columnIndex={columnIndex}
                            component={component}
                            debugPreviewPool={props.debugPreviewPool}
                            debugPreviewQueue={props.debugPreviewQueue}
                            fallbackFrameStates={props.frameStates}
                            fallbackPreviewCache={props.previewCache}
                            manifest={props.manifest}
                            onPreviewFrameMount={props.onPreviewFrameMount}
                            onPreviewGeometryChange={scope.onPreviewGeometryChange}
                            onSelect={scope.onSelectCard}
                            previewGeometryStore={props.previewGeometryStore}
                            selected={scope.selectedCardPathKey === componentPathKey}
                            selectedCaseName={selectedStudioCaseName(props.workspace, component)}
                            viewportPreset={scope.canvasViewportPreset}
                          />
                        </div>
                      )
                    })}
                  </section>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </StudioPreviewRenderSessionStoreProvider>
  )
}

function StudioPreviewRenderObservationPanel(props: {
  snapshot: StudioPreviewRenderObservationSnapshot
}) {
  const scrollResponse = props.snapshot.scrollResponse
  const fullRender = props.snapshot.fullRender

  return (
    <aside
      aria-label="Preview render observation"
      data-gtsx-preview-render-observation-panel="true"
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(216,222,228,0.95)",
        borderRadius: 6,
        bottom: 12,
        boxShadow: "0 3px 12px rgba(31,35,40,0.14)",
        color: "#1f2328",
        display: "grid",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
        gap: 3,
        left: 12,
        lineHeight: 1.35,
        padding: "7px 9px",
        pointerEvents: "none",
        position: "absolute",
        zIndex: 5,
      }}
    >
      <span data-gtsx-preview-render-observation-scroll="true">
        scroll{" "}
        {scrollResponse
          ? `${formatObservationMilliseconds(
              scrollResponse.firstVisibleCompletionMilliseconds,
            )} ${scrollResponse.completedVisibleSessionCount}/${scrollResponse.visibleSessionCount}`
          : "idle"}
      </span>
      <span data-gtsx-preview-render-observation-full="true">
        full{" "}
        {fullRender
          ? `${formatObservationMilliseconds(fullRender.latestCompletionMilliseconds)} ${fullRender.completedSessionCount}/${
              fullRender.sessionCount
            } ${formatObservationRate(fullRender.renderCompletionsPerSecond)}`
          : "idle"}
      </span>
    </aside>
  )
}

function formatObservationMilliseconds(value: number | undefined): string {
  return typeof value === "number" ? `${value}ms` : "..."
}

function formatObservationRate(value: number | undefined): string {
  return typeof value === "number" ? `${value}/s` : ".../s"
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
      casePreviewScale: 1,
      columnLayoutByIndex: {},
      onCanvasPointerCancel() {},
      onCanvasPointerDown() {},
      onCanvasPointerMove() {},
      onCanvasPointerUp() {},
      onPreviewGeometryChange() {},
      onSelectCard() {},
      onViewportPresetChange() {},
      previewRenderSessionStore: createStudioPreviewRenderSessionStore(),
      selected: { id: "file:src/MultiExport.g.tsx", components: [] },
      setCanvasSurfaceElement() {},
      setCanvasViewportElement() {},
      setCardElement() {},
      setColumnElement() {},
    },
  },
} satisfies GCases<StudioWorkspaceViewProps, StudioWorkspaceViewScope>
