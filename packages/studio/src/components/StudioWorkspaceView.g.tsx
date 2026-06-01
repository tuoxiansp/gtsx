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
  studioManifestProviderVariantAxes,
  studioProviderVariantContextForPath,
  type StudioPreviewCacheEntry,
  type StudioColumnLayout,
  visibleWorkspaceComponents,
  type StudioCanvasTransform,
  type StudioComponentSelectionOptions,
  type StudioPreviewFrameState,
  type StudioProviderVariantAxis,
  type StudioViewportPreset,
  type StudioWorkspaceState,
  findManifestComponent,
} from "../client"
import {
  studioPreviewRenderQueueRenderBufferMargin,
  type StudioPreviewRenderQueueOptions,
} from "../preview-render-queue"
import {
  createStudioPreviewRenderSessionStore,
  StudioPreviewRenderSessionStoreProvider,
  type StudioPreviewRenderSessionStore,
} from "../preview-render-session-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import {
  domRectToStudioCanvasScreenRect,
  studioCanvasCardIndex,
  studioCanvasTransformStyle,
  studioComponentPathForColumn,
  type StudioCanvasCardIndex,
  type StudioCanvasCardIndexEntry,
  studioPathKey,
  visibleStudioCanvasCardEntriesByColumnIndex,
} from "../studio-canvas-geometry"
import { studioCanvasTransformChangedEventType } from "../studio-canvas-transform-event"
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
import {
  studioCanvasBackgroundStyle,
  studioColors,
  studioFontFamily,
  studioLayoutNeutralDrilldownColumnEnterCss,
  studioLayoutNeutralDrilldownColumnEnterStyle,
  studioProviderVariantButtonStyle,
  studioRadii,
  studioShellStyle,
  studioTypography,
} from "../studio-theme"

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
  onChangeRootProviderVariant?: (providerName: string, variant: string | undefined) => void
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
  onChangeRootProviderVariant: (providerName: string, variant: string | undefined) => void
  onViewportPresetChange: (preset: StudioViewportPreset) => void
  onPreviewGeometryChange: () => void
  previewRenderSessionStore: StudioPreviewRenderSessionStore
  casePreviewScale: number
  selected: { id: string; components: StudioManifestComponent[] }
  selectedCardPathKey?: string
  setCanvasViewportElement: (element: HTMLDivElement | null) => void
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  columnMeasurementsByIndex: ReturnType<typeof useStudioCanvasLayout>["columnMeasurementsByIndex"]
  renderObservationSnapshot?: StudioPreviewRenderObservationSnapshot
  renderExpansionCenterPulse?: { id: number; x: number; y: number }
  visibleCardsByColumnIndex: Record<number, StudioCanvasCardIndexEntry[]>
}

type PendingStudioCanvasViewportPresetAnchor = {
  columnIndex: number
  coordinate: string
  pathKey: string
  remainingAttempts: number
  targetPreset: StudioViewportPreset
  targetViewportPoint: StudioCanvasViewportAnchorPoint
}

type StudioCanvasViewportAnchorPoint = {
  x: number
  y: number
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const canvasWheelExemptSelector = "[data-gtsx-canvas-wheel-exempt]"
const studioCanvasRevealMargin = 24
const defaultStudioCanvasVirtualViewportSize = { height: 720, width: 1280 }
const studioCanvasViewportPresetAnchorPreservationAttempts = 4

function shouldHandleCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(canvasWheelExemptSelector))
}

function shouldClearStudioCanvasSelectionForPointerTarget(target: EventTarget | null): boolean {
  return typeof Element === "undefined" || !(target instanceof Element) || !target.closest("a,button,iframe")
}

function useRealStudioWorkspaceViewScope(props: StudioWorkspaceViewProps): StudioWorkspaceViewScope {
  const selected = resolveStudioSelection(props.manifest, props.selection)
  const [selectedCardPathKey, setSelectedCardPathKey] = React.useState<string | undefined>()
  const [viewportPresetAnchorPathKey, setViewportPresetAnchorPathKey] = React.useState<string | undefined>()
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
  const pendingViewportPresetAnchorRef = React.useRef<PendingStudioCanvasViewportPresetAnchor | undefined>(undefined)
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
  const canvasCardIndex = React.useMemo(
    () =>
      studioCanvasCardIndex({
        columnMeasurementsByIndex: layout.columnMeasurementsByIndex,
        workspace: props.workspace,
      }),
    [layout.columnMeasurementsByIndex, props.workspace],
  )
  const canvasCardIndexRef = React.useRef(canvasCardIndex)
  canvasCardIndexRef.current = canvasCardIndex
  const casePreviewScaleRef = React.useRef(layout.casePreviewScale)
  casePreviewScaleRef.current = layout.casePreviewScale
  const visibleCardsByColumnIndex = useVisibleStudioCanvasCardsByColumnIndex({
    canvas: canvasController.canvas,
    canvasViewportElement: canvasController.canvasViewportElement,
    cardIndex: canvasCardIndex,
    columnLayoutByIndex: layout.columnLayoutByIndex,
    renderBufferMargin: studioPreviewRenderQueueRenderBufferMargin(props.previewRenderQueue),
    selectedCardPathKey: selectedCardPathKey ?? viewportPresetAnchorPathKey,
  })

  const { flushPreviewRender, requestCanvasPreviewRender, requestPreviewRender } = useStudioPreviewRenderScheduler({
    canvasRef: canvasController.canvasRef,
    canvasViewportElement: canvasController.canvasViewportElement,
    canvasViewportPresetRef,
    cardIndexRef: canvasCardIndexRef,
    casePreviewScaleRef,
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

  const captureViewportPresetAnchor = React.useCallback(
    (targetPreset: StudioViewportPreset): PendingStudioCanvasViewportPresetAnchor | undefined => {
      if (!canvasController.canvasViewportElement) return undefined

      const captured = captureStudioCanvasViewportPresetAnchor({
        canvasCardIndex,
        canvasViewportElement: canvasController.canvasViewportElement,
        getCardElement: layout.getCardElement,
        selectedCardPathKey,
        visibleCardsByColumnIndex,
      })
      if (!captured) return undefined

      return {
        ...captured,
        remainingAttempts: studioCanvasViewportPresetAnchorPreservationAttempts,
        targetPreset,
      }
    },
    [
      canvasCardIndex,
      canvasController.canvasViewportElement,
      layout.getCardElement,
      selectedCardPathKey,
      visibleCardsByColumnIndex,
    ],
  )

  const preservePendingViewportPresetAnchor = React.useCallback(() => {
    const pending = pendingViewportPresetAnchorRef.current
    if (!pending || pending.targetPreset !== canvasViewportPresetRef.current) return
    if (!canvasController.canvasViewportElement) return

    const cardElement = layout.getCardElement(pending.columnIndex, pending.coordinate)
    if (!cardElement) return

    const currentCanvas = canvasController.canvasRef.current
    const nextCanvas = preserveStudioCanvasViewportAnchor(currentCanvas, {
      currentViewportPoint: studioCanvasViewportCenterPointForElement(
        cardElement,
        canvasController.canvasViewportElement.getBoundingClientRect(),
      ),
      targetViewportPoint: pending.targetViewportPoint,
    })

    pending.remainingAttempts -= 1
    if (nextCanvas !== currentCanvas) canvasController.moveCanvas(() => nextCanvas)
    if (pending.remainingAttempts <= 0) {
      pendingViewportPresetAnchorRef.current = undefined
      setViewportPresetAnchorPathKey(undefined)
    }
  }, [canvasController, layout.getCardElement])

  useStudioLayoutEffect(() => {
    const pending = pendingViewportPresetAnchorRef.current
    if (!pending || pending.targetPreset !== canvasViewportPreset) return

    preservePendingViewportPresetAnchor()
    if (typeof window === "undefined") return

    const frames = new Set<number>()
    const scheduleFrame = (callback: () => void) => {
      const frame = window.requestAnimationFrame(() => {
        frames.delete(frame)
        callback()
      })
      frames.add(frame)
    }
    scheduleFrame(() => {
      preservePendingViewportPresetAnchor()
      scheduleFrame(preservePendingViewportPresetAnchor)
    })
    return () => {
      for (const frame of frames) window.cancelAnimationFrame(frame)
      frames.clear()
    }
  }, [
    canvasViewportPreset,
    layout.columnLayoutByIndex,
    layout.columnMeasurementsByIndex,
    preservePendingViewportPresetAnchor,
  ])

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
  const handleChangeRootProviderVariant = React.useCallback(
    (providerName: string, variant: string | undefined) => {
      props.onChangeRootProviderVariant?.(providerName, variant)
    },
    [props.onChangeRootProviderVariant],
  )
  const handleViewportPresetChange = React.useCallback(
    (preset: StudioViewportPreset) => {
      if (preset !== canvasViewportPreset) {
        const anchor = captureViewportPresetAnchor(preset)
        pendingViewportPresetAnchorRef.current = anchor
        setViewportPresetAnchorPathKey(anchor?.pathKey)
      }

      if (props.onChangeCanvasViewportPreset) {
        props.onChangeCanvasViewportPreset(preset)
      } else {
        for (const component of visibleWorkspaceComponents(props.workspace)) props.onChangeViewportPreset?.(component, preset)
      }
    },
    [
      canvasViewportPreset,
      captureViewportPresetAnchor,
      props.onChangeCanvasViewportPreset,
      props.onChangeViewportPreset,
      props.workspace,
    ],
  )

  return {
    canvas: canvasController.canvas,
    canvasViewportPreset,
    columnLayoutByIndex: layout.columnLayoutByIndex,
    columnMeasurementsByIndex: layout.columnMeasurementsByIndex,
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
    onChangeRootProviderVariant: handleChangeRootProviderVariant,
    onPreviewGeometryChange: layout.scheduleMeasurement,
    onViewportPresetChange: handleViewportPresetChange,
    casePreviewScale: layout.casePreviewScale,
    renderObservationSnapshot,
    renderExpansionCenterPulse,
    visibleCardsByColumnIndex,
    previewRenderSessionStore,
    selected,
    selectedCardPathKey,
    setCanvasSurfaceElement: canvasController.setCanvasSurfaceElement,
    setCanvasViewportElement: canvasController.setCanvasViewportElement,
    setCardElement: layout.setCardElement,
    setColumnElement: layout.setColumnElement,
  }
}

function useVisibleStudioCanvasCardsByColumnIndex(input: {
  canvas: StudioCanvasTransform
  canvasViewportElement: HTMLDivElement | null
  cardIndex: StudioCanvasCardIndex
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  renderBufferMargin: number
  selectedCardPathKey?: string
}): Record<number, StudioCanvasCardIndexEntry[]> {
  const [canvas, setCanvas] = React.useState(input.canvas)
  const [viewportSize, setViewportSize] = React.useState(defaultStudioCanvasVirtualViewportSize)

  useStudioLayoutEffect(() => {
    setCanvas(input.canvas)
  }, [input.canvas])

  useStudioLayoutEffect(() => {
    const element = input.canvasViewportElement
    if (!element || typeof ResizeObserver === "undefined") {
      if (element) setViewportSize(studioCanvasViewportElementSize(element))
      return
    }

    const updateViewportSize = () => setViewportSize(studioCanvasViewportElementSize(element))
    updateViewportSize()
    const observer = new ResizeObserver(updateViewportSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [input.canvasViewportElement])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    let frame = 0
    const handleCanvasTransformChange = (event: Event) => {
      const nextCanvas = (event as CustomEvent<StudioCanvasTransform>).detail
      if (!nextCanvas) return
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setCanvas(nextCanvas)
      })
    }

    window.addEventListener(studioCanvasTransformChangedEventType, handleCanvasTransformChange)
    return () => {
      window.removeEventListener(studioCanvasTransformChangedEventType, handleCanvasTransformChange)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return React.useMemo(
    () =>
      visibleStudioCanvasCardEntriesByColumnIndex({
        canvas,
        cardIndex: input.cardIndex,
        columnLayoutByIndex: input.columnLayoutByIndex,
        renderBufferMargin: input.renderBufferMargin,
        selectedCardPathKey: input.selectedCardPathKey,
        viewportSize,
      }),
    [
      canvas,
      input.cardIndex,
      input.columnLayoutByIndex,
      input.renderBufferMargin,
      input.selectedCardPathKey,
      viewportSize,
    ],
  )
}

function studioCanvasViewportElementSize(element: HTMLElement): { height: number; width: number } {
  const rect = element.getBoundingClientRect()
  return {
    height: Math.max(1, rect.height),
    width: Math.max(1, rect.width),
  }
}

function captureStudioCanvasViewportPresetAnchor(input: {
  canvasCardIndex: StudioCanvasCardIndex
  canvasViewportElement: HTMLElement
  getCardElement: (columnIndex: number, coordinate: string) => HTMLDivElement | undefined
  selectedCardPathKey?: string
  visibleCardsByColumnIndex: Record<number, StudioCanvasCardIndexEntry[]>
}): Omit<PendingStudioCanvasViewportPresetAnchor, "remainingAttempts" | "targetPreset"> | undefined {
  const viewportRect = input.canvasViewportElement.getBoundingClientRect()
  const selectedEntry = input.selectedCardPathKey ? input.canvasCardIndex.byPathKey[input.selectedCardPathKey] : undefined
  const selectedAnchor = selectedEntry
    ? studioCanvasViewportPresetAnchorForEntry(selectedEntry, viewportRect, input.getCardElement)
    : undefined
  if (selectedAnchor) return selectedAnchor

  const viewportCenterX = viewportRect.left + viewportRect.width / 2
  const viewportCenterY = viewportRect.top + viewportRect.height / 2
  let nearest:
    | {
        anchor: Omit<PendingStudioCanvasViewportPresetAnchor, "remainingAttempts" | "targetPreset">
        distance: number
      }
    | undefined

  for (const entries of Object.values(input.visibleCardsByColumnIndex)) {
    for (const entry of entries) {
      const anchor = studioCanvasViewportPresetAnchorForEntry(entry, viewportRect, input.getCardElement)
      if (!anchor) continue

      const absoluteCenterX = viewportRect.left + anchor.targetViewportPoint.x
      const absoluteCenterY = viewportRect.top + anchor.targetViewportPoint.y
      const distance = (absoluteCenterX - viewportCenterX) ** 2 + (absoluteCenterY - viewportCenterY) ** 2
      if (!nearest || distance < nearest.distance) nearest = { anchor, distance }
    }
  }

  return nearest?.anchor
}

function studioCanvasViewportPresetAnchorForEntry(
  entry: StudioCanvasCardIndexEntry,
  viewportRect: DOMRect,
  getCardElement: (columnIndex: number, coordinate: string) => HTMLDivElement | undefined,
): Omit<PendingStudioCanvasViewportPresetAnchor, "remainingAttempts" | "targetPreset"> | undefined {
  const cardElement = getCardElement(entry.columnIndex, entry.component.coordinate)
  if (!cardElement) return undefined

  return {
    columnIndex: entry.columnIndex,
    coordinate: entry.component.coordinate,
    pathKey: entry.pathKey,
    targetViewportPoint: studioCanvasViewportCenterPointForElement(cardElement, viewportRect),
  }
}

function studioCanvasViewportCenterPointForElement(
  element: HTMLElement,
  viewportRect: DOMRect,
): StudioCanvasViewportAnchorPoint {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2 - viewportRect.left,
    y: rect.top + rect.height / 2 - viewportRect.top,
  }
}

export function preserveStudioCanvasViewportAnchor(
  current: StudioCanvasTransform,
  input: {
    currentViewportPoint: StudioCanvasViewportAnchorPoint
    targetViewportPoint: StudioCanvasViewportAnchorPoint
  },
): StudioCanvasTransform {
  const deltaX = input.targetViewportPoint.x - input.currentViewportPoint.x
  const deltaY = input.targetViewportPoint.y - input.currentViewportPoint.y
  if (deltaX === 0 && deltaY === 0) return current

  return {
    ...current,
    x: current.x + deltaX,
    y: current.y + deltaY,
  }
}

export function layoutNeutralDrilldownColumnEnterIdentity(
  workspace: StudioWorkspaceState,
  columnIndex: number,
  column: StudioWorkspaceState["columns"][number],
): string {
  if (columnIndex === 0) return "root"

  return [
    `column:${columnIndex}`,
    `path:${workspace.selectedCoordinatePath.slice(0, columnIndex).join(" > ")}`,
    `parent:${column.parentCoordinate ?? ""}`,
    `components:${column.components.map((component) => component.coordinate).join(",")}`,
  ].join("|")
}

const useStudioWorkspaceViewScope = createGScopeHook(useRealStudioWorkspaceViewScope)

export default function Studio(props: StudioWorkspaceViewProps) {
  const scope = useStudioWorkspaceViewScope(props)
  const previewCacheReady = props.previewCacheReady ?? true
  const canvasSurfaceTransform = studioCanvasTransformStyle(scope.canvas)
  const rootProviderVariantAxes = studioManifestProviderVariantAxes(props.manifest, props.workspace.rootProviderVariants)

  return (
    <StudioPreviewRenderSessionStoreProvider store={scope.previewRenderSessionStore}>
      <main
        style={{
          ...studioShellStyle(),
          display: "grid",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        <style>{studioLayoutNeutralDrilldownColumnEnterCss}</style>
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
              ...studioCanvasBackgroundStyle(),
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
            <StudioRootProviderVariantControls
              axes={rootProviderVariantAxes}
              onChange={scope.onChangeRootProviderVariant}
            />
            {scope.renderExpansionCenterPulse ? (
              <span
                aria-label="Preview render expansion center"
                data-gtsx-preview-render-expansion-center-pulse="true"
                key={scope.renderExpansionCenterPulse.id}
                style={{
                  background: studioColors.accentMuted,
                  border: `2px solid ${studioColors.accent}`,
                  borderRadius: 999,
                  boxShadow: `0 0 0 6px ${studioColors.accentMuted}`,
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
                  background: studioColors.warningBg,
                  border: `1px solid ${studioColors.warningBorder}`,
                  borderRadius: studioRadii.md,
                  color: studioColors.warningText,
                  fontFamily: studioFontFamily,
                  fontSize: 11,
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
                  left: "0px",
                  paddingBottom: "80px",
                  paddingLeft: "0px",
                  paddingRight: "80px",
                  paddingTop: "0px",
                  position: "absolute",
                  top: "0px",
                  transform: canvasSurfaceTransform,
                  transformOrigin: "0px 0px",
                }}
              >
                {props.workspace.columns.map((column, columnIndex) => {
                  const drilldownColumnEnterIdentity = layoutNeutralDrilldownColumnEnterIdentity(
                    props.workspace,
                    columnIndex,
                    column,
                  )
                  return (
                    <section
                      data-gtsx-column-index={columnIndex}
                      data-gtsx-column-layout-x={scope.columnLayoutByIndex[columnIndex]?.x ?? 0}
                      data-gtsx-column-layout-y={scope.columnLayoutByIndex[columnIndex]?.y ?? 0}
                      data-gtsx-column-parent-coordinate={column.parentCoordinate}
                      data-gtsx-drilldown-column-enter={columnIndex > 0 ? "true" : undefined}
                      data-gtsx-drilldown-column-enter-identity={columnIndex > 0 ? drilldownColumnEnterIdentity : undefined}
                      key={drilldownColumnEnterIdentity}
                      ref={(element) => scope.setColumnElement(columnIndex, element)}
                      style={{
                        display: "block",
                        height: scope.columnMeasurementsByIndex[columnIndex]?.height ?? 0,
                        left: scope.columnLayoutByIndex[columnIndex]?.x ?? 0,
                        position: "absolute",
                        top: scope.columnLayoutByIndex[columnIndex]?.y ?? 0,
                        width: "max-content",
                        ...(columnIndex > 0 ? studioLayoutNeutralDrilldownColumnEnterStyle() : {}),
                      }}
                    >
                      {(scope.visibleCardsByColumnIndex[columnIndex] ?? []).map((card) => {
                        const component = card.component
                        const cardRect =
                          card.rect ?? scope.columnMeasurementsByIndex[columnIndex]?.cardRectsByCoordinate[component.coordinate]
                        const providerVariantPath = studioComponentPathForColumn(
                          props.workspace,
                          columnIndex,
                          component.coordinate,
                        )
                        return (
                          <div
                            key={component.coordinate}
                            ref={(element) => scope.setCardElement(columnIndex, component.coordinate, element)}
                            style={{
                              display: "grid",
                              left: cardRect?.left ?? 0,
                              position: "absolute",
                              top: cardRect?.top ?? 0,
                              width: "max-content",
                            }}
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
                              providerVariantComponent={findManifestComponent(props.manifest, component.coordinate) ?? component}
                              providerVariantContext={studioProviderVariantContextForPath(props.workspace, providerVariantPath)}
                              selected={scope.selectedCardPathKey === card.pathKey}
                              selectedCaseName={selectedStudioCaseName(props.workspace, component)}
                              viewportPreset={scope.canvasViewportPreset}
                            />
                          </div>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </StudioPreviewRenderSessionStoreProvider>
  )
}

function StudioRootProviderVariantControls(props: {
  axes: StudioProviderVariantAxis[]
  onChange: (providerName: string, variant: string | undefined) => void
}) {
  if (props.axes.length === 0) return null

  return (
    <div
      aria-label="Provider variants"
      data-gtsx-canvas-wheel-exempt
      data-gtsx-root-env-controls="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        background: studioColors.panelBg,
        border: `1px solid ${studioColors.panelBorder}`,
        borderRadius: studioRadii.md,
        bottom: 16,
        display: "grid",
        fontFamily: studioFontFamily,
        gap: 0,
        maxHeight: "min(320px, calc(100vh - 32px))",
        maxWidth: "min(420px, calc(100vw - 32px))",
        overflow: "auto",
        padding: "10px 12px 12px",
        position: "absolute",
        right: 16,
        zIndex: 4,
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${studioColors.panelBorderSubtle}`,
          color: studioColors.textDim,
          fontSize: studioTypography.controlLabel.fontSize,
          fontWeight: studioTypography.controlLabel.fontWeight,
          letterSpacing: studioTypography.controlLabel.letterSpacing,
          lineHeight: studioTypography.controlLabel.lineHeight,
          marginBottom: 10,
          paddingBottom: 8,
          textTransform: "uppercase",
        }}
      >
        Environment
      </header>
      {props.axes.map((axis, axisIndex) => (
        <div
          data-gtsx-root-env-axis={axis.providerName}
          key={axis.providerName}
          style={{
            display: "grid",
            gap: 6,
            minWidth: 0,
            ...(axisIndex > 0
              ? {
                  borderTop: `1px solid ${studioColors.panelBorderSubtle}`,
                  marginTop: 10,
                  paddingTop: 10,
                }
              : {}),
          }}
        >
          <span
            title={axis.providerName}
            style={{
              color: studioColors.textDim,
              fontSize: studioTypography.controlLabel.fontSize,
              fontWeight: studioTypography.controlLabel.fontWeight,
              letterSpacing: studioTypography.controlLabel.letterSpacing,
              lineHeight: studioTypography.controlLabel.lineHeight,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {providerVariantAxisLabel(axis.providerName)}
          </span>
          <div
            aria-label={`${axis.providerName} root variants`}
            role="group"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              minWidth: 0,
            }}
          >
            <StudioProviderVariantButton
              pressed={!axis.selectedVariant}
              variantName="all"
              onClick={() => props.onChange(axis.providerName, undefined)}
            />
            {axis.variants.map((variant) => (
              <StudioProviderVariantButton
                key={variant.name}
                pressed={variant.selected}
                variantName={variant.name}
                onClick={() => props.onChange(axis.providerName, variant.name)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StudioProviderVariantButton(props: {
  onClick: () => void
  pressed: boolean
  variantName: string
}) {
  return (
    <button
      aria-pressed={props.pressed}
      data-gtsx-root-env-selected={props.pressed ? "true" : undefined}
      data-gtsx-root-env-variant={props.variantName}
      onClick={(event) => {
        event.stopPropagation()
        props.onClick()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={studioProviderVariantButtonStyle(props.pressed)}
      title={props.variantName}
      type="button"
    >
      {props.variantName}
    </button>
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
        background: studioColors.panelBg,
        border: `1px solid ${studioColors.panelBorder}`,
        borderRadius: studioRadii.md,
        bottom: 12,
        color: studioColors.textMuted,
        display: "grid",
        fontFamily: studioFontFamily,
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

function providerVariantAxisLabel(providerName: string): string {
  return providerName.endsWith("Provider") ? providerName.slice(0, -"Provider".length) : providerName
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
        rootProviderVariants: {},
        selectedCaseByCoordinate: {},
        selectedCoordinatePath: [],
        selectedProviderVariantsByPath: {},
        selectedRuntimeInstanceByCoordinate: {},
        selectedViewportPresetByCoordinate: {},
      },
    },
    scope: {
      canvas: { x: 40, y: 40, scale: 1 },
      canvasViewportPreset: "tablet",
      casePreviewScale: 1,
      columnLayoutByIndex: {},
      columnMeasurementsByIndex: {},
      onCanvasPointerCancel() {},
      onCanvasPointerDown() {},
      onCanvasPointerMove() {},
      onCanvasPointerUp() {},
      onPreviewGeometryChange() {},
      onChangeRootProviderVariant() {},
      onSelectCard() {},
      onViewportPresetChange() {},
      previewRenderSessionStore: createStudioPreviewRenderSessionStore(),
      selected: { id: "file:src/MultiExport.g.tsx", components: [] },
      setCanvasSurfaceElement() {},
      setCanvasViewportElement() {},
      setCardElement() {},
      setColumnElement() {},
      visibleCardsByColumnIndex: {},
    },
  },
  debugQueueObserved: {
    props: {
      debugPreviewQueue: true,
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
            path: "src/UserCard.g.tsx",
            groupId: "file:src/UserCard.g.tsx",
            components: [
              {
                coordinate: "src/UserCard.g.tsx#default",
                filePath: "src/UserCard.g.tsx",
                exportName: "default",
                componentName: "UserCard",
                mode: "pure",
                cases: [
                  { kind: "pure", name: "loading", providerVariants: { ThemeProvider: "light" } },
                  { kind: "pure", name: "ready", providerVariants: { ThemeProvider: "dark" } },
                ],
                providers: {
                  ThemeProvider: {
                    name: "ThemeProvider",
                    cases: [],
                    variants: ["light", "dark"],
                  },
                },
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
                coordinate: "src/UserCard.g.tsx#default",
                filePath: "src/UserCard.g.tsx",
                exportName: "default",
                componentName: "UserCard",
                mode: "pure",
                cases: [
                  { kind: "pure", name: "loading", providerVariants: { ThemeProvider: "light" } },
                  { kind: "pure", name: "ready", providerVariants: { ThemeProvider: "dark" } },
                ],
                providers: {
                  ThemeProvider: {
                    name: "ThemeProvider",
                    cases: [],
                    variants: ["light", "dark"],
                  },
                },
                diagnostics: [],
              },
            ],
          },
        ],
        rootProviderVariants: { ThemeProvider: "dark" },
        selectedCaseByCoordinate: {},
        selectedCoordinatePath: [],
        selectedProviderVariantsByPath: {},
        selectedRuntimeInstanceByCoordinate: {},
        selectedViewportPresetByCoordinate: {},
      },
    },
    scope: {
      canvas: { x: 40, y: 40, scale: 1 },
      canvasViewportPreset: "tablet",
      casePreviewScale: 1,
      columnLayoutByIndex: {},
      columnMeasurementsByIndex: {},
      onCanvasPointerCancel() {},
      onCanvasPointerDown() {},
      onCanvasPointerMove() {},
      onCanvasPointerUp() {},
      onPreviewGeometryChange() {},
      onChangeRootProviderVariant() {},
      onSelectCard() {},
      onViewportPresetChange() {},
      previewRenderSessionStore: createStudioPreviewRenderSessionStore(),
      renderObservationSnapshot: {
        sequence: 1,
        fullRender: {
          completedSessionCount: 1,
          latestCompletionMilliseconds: 42,
          pendingSessionCount: 1,
          renderCompletionsPerSecond: 8,
          sessionCount: 2,
          startedAtMilliseconds: 0,
        },
        scrollResponse: {
          completedVisibleSessionCount: 1,
          firstVisibleCompletionMilliseconds: 24,
          latestVisibleCompletionMilliseconds: 24,
          pendingVisibleSessionCount: 0,
          startedAtMilliseconds: 0,
          visibleSessionCount: 1,
        },
      },
      selected: { id: "file:src/UserCard.g.tsx", components: [] },
      setCanvasSurfaceElement() {},
      setCanvasViewportElement() {},
      setCardElement() {},
      setColumnElement() {},
      visibleCardsByColumnIndex: {},
    },
  },
} satisfies GCases<StudioWorkspaceViewProps, StudioWorkspaceViewScope>
