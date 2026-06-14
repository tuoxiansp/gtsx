"use client"

import React from "react"
import { createGScopeHook, type GFrames } from "@runelight/react/runtime"

import {
  previewSessionId,
  studioDesignManifestComponents,
  type StudioCanvasTransform,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioProviderVariantContext,
  type StudioViewportPreset,
} from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import type { StudioPreviewGeometryCacheStore } from "../preview-geometry-cache-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { studioPreviewRenderQueueRenderBufferMargin, type StudioPreviewRenderQueueOptions } from "../preview-render-queue"
import {
  createStudioPreviewRenderSessionStore,
  StudioPreviewRenderSessionStoreProvider,
  type StudioPreviewRenderSessionStore,
} from "../preview-render-session-store"
import {
  studioCanvasFixedFramePreviewScale,
  studioCanvasTransformStyle,
  studioPathKey,
  studioComponentCardLayout,
  visibleStudioCanvasCardEntriesByColumnIndex,
  type StudioCanvasCardIndex,
  type StudioCanvasCardIndexEntry,
} from "../studio-canvas-geometry"
import { studioCanvasTransformChangedEventType } from "../studio-canvas-transform-event"
import { studioComponentFrameLayoutFrameStates } from "../studio-component-preview-frame-states"
import {
  studioCanvasBackgroundStyle,
  studioColors,
  studioFontFamily,
  studioRadii,
  studioShellStyle,
} from "../studio-theme"
import { studioComponentFrameGridGap } from "../frame-grid-layout"
import { useStudioCanvasController } from "../use-studio-canvas-controller"
import StudioComponentCardSlot from "./StudioComponentCardSlot"
import ViewportPresetTabs from "./ViewportPresetTabs.g"

export type StudioDesignWorkspaceProps = {
  canvas?: StudioCanvasTransform
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  frameStates?: Record<string, StudioPreviewFrameState>
  manifest: StudioManifest
  onChangeCanvas?: (canvas: StudioCanvasTransform) => void
  onChangeViewportPreset?: (preset: StudioViewportPreset) => void
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewCacheReady?: boolean
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  previewRenderQueue?: StudioPreviewRenderQueueOptions
  viewportPreset?: StudioViewportPreset
}

type StudioDesignCardLayout = {
  height: number
  width: number
}

type StudioDesignPackedLayout = {
  cardLayoutsByCoordinate: Record<string, StudioDesignCardLayout>
  cardRectsByCoordinate: Record<string, StudioDesignCanvasRect>
  height: number
  width: number
}

type StudioDesignCanvasRect = {
  bottom: number
  left: number
  right: number
  top: number
}

type StudioDesignWorkspaceScope = {
  canvas: StudioCanvasTransform
  canvasHeight: number
  canvasWidth: number
  components: StudioManifestComponent[]
  onCanvasPointerCancel: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerDown: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerMove: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerUp: React.PointerEventHandler<HTMLDivElement>
  onPreviewGeometryChange: () => void
  onSelectCard: (
    component: StudioManifestComponent,
    frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
    columnIndex: number,
    source: "keyboard" | "pointer",
  ) => void
  onViewportPresetChange: (preset: StudioViewportPreset) => void
  previewRenderSessionStore: StudioPreviewRenderSessionStore
  selectedCoordinate?: string
  setCanvasSurfaceElement: (element: HTMLDivElement | null) => void
  setCanvasViewportElement: (element: HTMLDivElement | null) => void
  viewportPreset: StudioViewportPreset
  visibleCards: StudioCanvasCardIndexEntry[]
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const canvasWheelExemptSelector = "[data-runelight-canvas-wheel-exempt]"
const defaultStudioDesignVirtualViewportSize = { height: 720, width: 1280 }
const emptyProviderVariantContext: StudioProviderVariantContext = {}
const studioDesignCanvasWidth = 1600
const studioDesignCanvasPaddingBottom = 120
const studioDesignCanvasPaddingLeft = 96
const studioDesignCanvasPaddingRight = 96
const studioDesignCanvasPaddingTop = 108
const studioDesignCardMinWidth = 0
const studioDesignCardColumnGap = studioComponentFrameGridGap
const studioDesignCardRowGap = studioComponentFrameGridGap
const emptyStudioDesignCards: StudioCanvasCardIndexEntry[] = []

function shouldHandleCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(canvasWheelExemptSelector))
}

function useRealStudioDesignWorkspaceScope(props: StudioDesignWorkspaceProps): StudioDesignWorkspaceScope {
  const components = React.useMemo(() => studioDesignManifestComponents(props.manifest), [props.manifest])
  const [localViewportPreset, setLocalViewportPreset] = React.useState<StudioViewportPreset>("tablet")
  const [selectedCoordinate, setSelectedCoordinate] = React.useState<string | undefined>()
  const [layoutVersion, setLayoutVersion] = React.useState(0)
  const viewportPreset = props.viewportPreset ?? localViewportPreset
  const previewRenderSessionStore = React.useMemo(() => createStudioPreviewRenderSessionStore(), [])
  const canvasController = useStudioCanvasController({
    canvas: props.canvas,
    onCanvasChange: props.onChangeCanvas,
    onCanvasMove() {},
    onCanvasPanEnd() {},
    shouldHandleWheelTarget: shouldHandleCanvasWheelTarget,
  })
  const packedLayout = React.useMemo(
    () =>
      createStudioDesignPackedLayout({
        components,
        frameStates: props.frameStates,
        previewCache: props.previewCache,
        previewGeometryStore: props.previewGeometryStore,
        viewportPreset,
      }),
    [
      components,
      layoutVersion,
      props.frameStates,
      props.previewCache,
      props.previewGeometryStore,
      viewportPreset,
    ],
  )
  const columnLayoutByIndex = React.useMemo(
    () => ({ 0: { x: studioDesignCanvasPaddingLeft, y: studioDesignCanvasPaddingTop } }),
    [],
  )
  const cardIndex = React.useMemo(
    () => createStudioDesignCanvasCardIndex(components, packedLayout.cardRectsByCoordinate),
    [components, packedLayout.cardRectsByCoordinate],
  )
  const visibleCardsByColumnIndex = useVisibleStudioDesignCanvasCards({
    canvas: canvasController.canvas,
    canvasViewportElement: canvasController.canvasViewportElement,
    cardIndex,
    columnLayoutByIndex,
    renderBufferMargin: studioPreviewRenderQueueRenderBufferMargin(props.previewRenderQueue),
  })
  const visibleCards = visibleCardsByColumnIndex[0] ?? emptyStudioDesignCards

  React.useEffect(() => {
    const sessionIds = new Set(
      visibleCards.flatMap((card) => card.component.frames.map((frame) => previewSessionId(card.component, frame.name, viewportPreset))),
    )
    previewRenderSessionStore.setSessionIds(sessionIds, sessionIds)
  }, [previewRenderSessionStore, viewportPreset, visibleCards])

  const handleViewportPresetChange = React.useCallback(
    (preset: StudioViewportPreset) => {
      setLocalViewportPreset(preset)
      props.onChangeViewportPreset?.(preset)
    },
    [props.onChangeViewportPreset],
  )
  const handleSelectCard = React.useCallback(
    (
      component: StudioManifestComponent,
      _frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
      _columnIndex: number,
      _source: "keyboard" | "pointer",
    ) => {
      setSelectedCoordinate((current) => (current === component.coordinate ? undefined : component.coordinate))
    },
    [],
  )
  const handlePreviewGeometryChange = React.useCallback(() => {
    setLayoutVersion((current) => current + 1)
  }, [])

  return {
    canvas: canvasController.canvas,
    canvasHeight: studioDesignCanvasPaddingTop + packedLayout.height + studioDesignCanvasPaddingBottom,
    canvasWidth: studioDesignCanvasPaddingLeft + packedLayout.width + studioDesignCanvasPaddingRight,
    components,
    onCanvasPointerCancel: canvasController.onCanvasPointerCancel,
    onCanvasPointerDown: canvasController.onCanvasPointerDown,
    onCanvasPointerMove: canvasController.onCanvasPointerMove,
    onCanvasPointerUp: canvasController.onCanvasPointerUp,
    onPreviewGeometryChange: handlePreviewGeometryChange,
    onSelectCard: handleSelectCard,
    onViewportPresetChange: handleViewportPresetChange,
    previewRenderSessionStore,
    selectedCoordinate,
    setCanvasSurfaceElement: canvasController.setCanvasSurfaceElement,
    setCanvasViewportElement: canvasController.setCanvasViewportElement,
    viewportPreset,
    visibleCards,
  }
}

const useStudioDesignWorkspaceScope = createGScopeHook(useRealStudioDesignWorkspaceScope)

function StudioDesignWorkspaceView(props: StudioDesignWorkspaceProps) {
  const scope = useStudioDesignWorkspaceScope(props)
  const previewCacheReady = props.previewCacheReady ?? true
  const canvasSurfaceTransform = studioCanvasTransformStyle(scope.canvas)

  return (
    <StudioPreviewRenderSessionStoreProvider store={scope.previewRenderSessionStore}>
      <main
        data-runelight-studio-design-workspace="true"
        style={{
          ...studioShellStyle(),
          height: "100vh",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          aria-label="Runelight Studio design canvas viewport"
          data-runelight-canvas-viewport="true"
          data-runelight-studio-design-viewport="true"
          onPointerCancel={scope.onCanvasPointerCancel}
          onPointerDown={scope.onCanvasPointerDown}
          onPointerMove={scope.onCanvasPointerMove}
          onPointerUp={scope.onCanvasPointerUp}
          ref={scope.setCanvasViewportElement}
          role="application"
          style={{
            ...studioCanvasBackgroundStyle(),
            cursor: "grab",
            height: "100%",
            minHeight: 0,
            overscrollBehavior: "none",
            overflow: "hidden",
            position: "relative",
            touchAction: "none",
            width: "100%",
          }}
          tabIndex={0}
        >
          <ViewportPresetTabs floating onChange={scope.onViewportPresetChange} selectedPreset={scope.viewportPreset} />
          {previewCacheReady ? (
            <div
              data-runelight-canvas-surface="true"
              data-runelight-studio-design-canvas="true"
              data-runelight-studio-design-layout-width={studioDesignCanvasWidth}
              ref={scope.setCanvasSurfaceElement}
              style={{
                display: "block",
                height: scope.canvasHeight,
                left: 0,
                position: "absolute",
                top: 0,
                transform: canvasSurfaceTransform,
                transformOrigin: "0px 0px",
                width: scope.canvasWidth,
              }}
            >
              {scope.components.length > 0 ? (
                scope.visibleCards.map((card) => {
                  const component = card.component
                  const rect = card.rect
                  if (!rect) return null

                  return (
                    <div
                      data-runelight-studio-design-card={component.coordinate}
                      key={component.coordinate}
                      style={{
                        display: "grid",
                        left: studioDesignCanvasPaddingLeft + rect.left,
                        position: "absolute",
                        top: studioDesignCanvasPaddingTop + rect.top,
                        width: rect.right - rect.left,
                      }}
                    >
                      <StudioComponentCardSlot
                        framePreviewScale={studioCanvasFixedFramePreviewScale}
                        cardMinWidth={studioDesignCardMinWidth}
                        columnIndex={0}
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
                        providerVariantComponent={component}
                        providerVariantContext={emptyProviderVariantContext}
                        selected={scope.selectedCoordinate === component.coordinate}
                        selectedFrameName={component.frames[0]?.name ?? "missing-frames"}
                        viewportPreset={scope.viewportPreset}
                      />
                    </div>
                  )
                })
              ) : (
                <section
                  data-runelight-studio-design-empty="true"
                  style={{
                    background: studioColors.panelBg,
                    border: `1px solid ${studioColors.panelBorder}`,
                    borderRadius: studioRadii.md,
                    color: studioColors.textMuted,
                    display: "grid",
                    fontFamily: studioFontFamily,
                    fontSize: 12,
                    gap: 6,
                    left: studioDesignCanvasPaddingLeft,
                    lineHeight: 1.4,
                    padding: 18,
                    position: "absolute",
                    top: studioDesignCanvasPaddingTop,
                    width: 300,
                  }}
                >
                  <strong style={{ color: studioColors.text, fontSize: 12, fontWeight: 600 }}>No design frames</strong>
                  <span>project.entryRoot/design/*.g.tsx or *.g.vue</span>
                </section>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </StudioPreviewRenderSessionStoreProvider>
  )
}

function createStudioDesignPackedLayout(input: {
  components: StudioManifestComponent[]
  frameStates?: Record<string, StudioPreviewFrameState>
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
}): StudioDesignPackedLayout {
  const cardLayoutsByCoordinate: Record<string, StudioDesignCardLayout> = {}
  const cardRectsByCoordinate: Record<string, StudioDesignCanvasRect> = {}
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const component of input.components) {
    const frameStatesByName = studioComponentFrameLayoutFrameStates(
      component,
      input.viewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    )
    const cardLayout = studioComponentCardLayout({
      component,
      cardMinWidth: studioDesignCardMinWidth,
      framePreviewScale: studioCanvasFixedFramePreviewScale,
      frameStatesByName,
      viewportPreset: input.viewportPreset,
    })

    if (cursorX > 0 && cursorX + cardLayout.width > studioDesignCanvasWidth) {
      cursorX = 0
      cursorY += rowHeight + studioDesignCardRowGap
      rowHeight = 0
    }

    cardLayoutsByCoordinate[component.coordinate] = {
      height: cardLayout.height,
      width: cardLayout.width,
    }
    cardRectsByCoordinate[component.coordinate] = {
      bottom: cursorY + cardLayout.height,
      left: cursorX,
      right: cursorX + cardLayout.width,
      top: cursorY,
    }
    cursorX += cardLayout.width + studioDesignCardColumnGap
    rowHeight = Math.max(rowHeight, cardLayout.height)
  }

  return {
    cardLayoutsByCoordinate,
    cardRectsByCoordinate,
    height: input.components.length > 0 ? cursorY + rowHeight : 0,
    width: studioDesignCanvasWidth,
  }
}

function createStudioDesignCanvasCardIndex(
  components: StudioManifestComponent[],
  cardRectsByCoordinate: Record<string, StudioDesignCanvasRect>,
): StudioCanvasCardIndex {
  let complete = true
  const byPathKey: Record<string, StudioCanvasCardIndexEntry> = {}
  const entries = components
    .map((component) => {
      const rect = cardRectsByCoordinate[component.coordinate]
      if (!rect) complete = false
      const entry: StudioCanvasCardIndexEntry = {
        columnIndex: 0,
        component,
        pathKey: studioPathKey([component.coordinate]),
        rect,
      }
      byPathKey[entry.pathKey] = entry
      return entry
    })
    .sort((left, right) => (left.rect?.top ?? 0) - (right.rect?.top ?? 0) || (left.rect?.left ?? 0) - (right.rect?.left ?? 0))

  return {
    byColumnIndex: { 0: entries },
    byPathKey,
    complete,
  }
}

function useVisibleStudioDesignCanvasCards(input: {
  canvas: StudioCanvasTransform
  canvasViewportElement: HTMLDivElement | null
  cardIndex: StudioCanvasCardIndex
  columnLayoutByIndex: Record<number, { x: number; y: number }>
  renderBufferMargin: number
}): Record<number, StudioCanvasCardIndexEntry[]> {
  const [canvas, setCanvas] = React.useState(input.canvas)
  const [viewportSize, setViewportSize] = React.useState(defaultStudioDesignVirtualViewportSize)

  useStudioLayoutEffect(() => {
    setCanvas(input.canvas)
  }, [input.canvas])

  useStudioLayoutEffect(() => {
    const element = input.canvasViewportElement
    if (!element || typeof ResizeObserver === "undefined") {
      if (element) setViewportSize(studioDesignCanvasViewportElementSize(element))
      return
    }

    const updateViewportSize = () => setViewportSize(studioDesignCanvasViewportElementSize(element))
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
        viewportSize,
      }),
    [
      canvas,
      input.cardIndex,
      input.columnLayoutByIndex,
      input.renderBufferMargin,
      viewportSize,
    ],
  )
}

function studioDesignCanvasViewportElementSize(element: HTMLElement): { height: number; width: number } {
  const rect = element.getBoundingClientRect()
  return {
    height: Math.max(1, rect.height),
    width: Math.max(1, rect.width),
  }
}

const StudioDesignWorkspace = React.memo(StudioDesignWorkspaceView) as typeof StudioDesignWorkspaceView & {
  frames?: GFrames<StudioDesignWorkspaceProps>
}

export default StudioDesignWorkspace

StudioDesignWorkspace.frames = {
  designFrames: {
    props: {
      manifest: {
        version: 1,
        design: {
          frames: [
            {
              id: "app/runelight/design/DesignHost.g.tsx#default:live",
              entry: "app/runelight/design/DesignHost.g.tsx#default",
              filePath: "app/runelight/design/DesignHost.g.tsx",
              title: "DesignHost",
              exportName: "default",
              frameName: "live",
            },
            {
              id: "app/runelight/design/DesignHost.g.tsx#default:loaded",
              entry: "app/runelight/design/DesignHost.g.tsx#default",
              filePath: "app/runelight/design/DesignHost.g.tsx",
              title: "DesignHost",
              exportName: "default",
              frameName: "loaded",
            },
          ],
        },
        routes: {
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
        },
        files: [
          {
            path: "app/runelight/design/DesignHost.g.tsx",
            sourceHash: "design-host-source",
            components: [
              {
                coordinate: "app/runelight/design/DesignHost.g.tsx#default",
                filePath: "app/runelight/design/DesignHost.g.tsx",
                sourceHash: "design-host-source",
                exportName: "default",
                componentName: "DesignHost",
                mode: "pure",
                frames: [
                  { kind: "pure", name: "live" },
                  { kind: "pure", name: "loaded" },
                ],
                providers: {},
                diagnostics: [],
              },
            ],
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
    },
  },
} satisfies GFrames<StudioDesignWorkspaceProps>
