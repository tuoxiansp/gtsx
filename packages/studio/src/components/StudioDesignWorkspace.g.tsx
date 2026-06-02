"use client"

import React from "react"
import type { GCases } from "@gtsx/core"

import type { StudioViewportPreset } from "../client"
import {
  studioComponentCardTitleGap,
  studioComponentCardTitleHeight,
  studioComponentCardTitleScreenGap,
  studioComponentCardTitleScreenHeight,
} from "../case-grid-layout"
import type { StudioDesignFrameEntry, StudioManifest } from "../manifest"
import {
  studioCanvasScreenStableChromeContentBeforeCanvasAnchorStyle,
  studioCanvasScreenStableChromeSlotStyle,
} from "../studio-canvas-screen-stable-chrome"
import { studioCanvasTransformStyle } from "../studio-canvas-geometry"
import {
  studioCanvasBackgroundStyle,
  studioCardTitleIndicatorStyle,
  studioCardTitleStyle,
  studioColors,
  studioFontFamily,
  studioRadii,
  studioShellStyle,
} from "../studio-theme"
import { useStudioCanvasController } from "../use-studio-canvas-controller"
import ViewportPresetTabs from "./ViewportPresetTabs.g"

export type StudioDesignWorkspaceProps = {
  manifest: StudioManifest
}

type StudioDesignFrameLayout = {
  x: number
  y: number
}

type StudioDesignFrameLayouts = Record<string, StudioDesignFrameLayout>

type StudioDesignDragState = {
  frameId: string
  originClientX: number
  originClientY: number
  originX: number
  originY: number
  pointerId: number
}

type StudioDesignFrameSize = {
  height: number
  width: number
}

const studioDesignViewportSizes = {
  phone: { height: 812, width: 375 },
  tablet: { height: 960, width: 768 },
  desktop: { height: 900, width: 1180 },
} satisfies Record<StudioViewportPreset, StudioDesignFrameSize>

const studioDesignFrameColumnGap = 56
const studioDesignFrameRowGap = 104
const emptyStudioDesignFrames: StudioDesignFrameEntry[] = []
const canvasWheelExemptSelector = "[data-gtsx-canvas-wheel-exempt]"

function shouldHandleCanvasWheelTarget(target: EventTarget | null): boolean {
  return !(typeof Element !== "undefined" && target instanceof Element && target.closest(canvasWheelExemptSelector))
}

function StudioDesignWorkspaceView(props: StudioDesignWorkspaceProps) {
  const frames = props.manifest.design?.frames ?? emptyStudioDesignFrames
  const storageKey = React.useMemo(() => studioDesignWorkspaceStorageKey(props.manifest), [props.manifest])
  const { layouts, persistLayouts, updateLayouts } = useStudioDesignFrameLayouts(frames, storageKey)
  const dragRef = React.useRef<StudioDesignDragState | undefined>(undefined)
  const [activeFrameId, setActiveFrameId] = React.useState<string | undefined>()
  const [viewportPreset, setViewportPreset] = React.useState<StudioViewportPreset>("tablet")
  const canvasController = useStudioCanvasController({
    onCanvasMove() {},
    onCanvasPanEnd() {},
    shouldHandleWheelTarget: shouldHandleCanvasWheelTarget,
  })
  const canvasSurfaceTransform = studioCanvasTransformStyle(canvasController.canvas)
  const frameSize = studioDesignViewportSizes[viewportPreset]

  const handleFrameHeaderPointerDown = React.useCallback(
    (frame: StudioDesignFrameEntry, layout: StudioDesignFrameLayout): React.PointerEventHandler<HTMLDivElement> =>
      (event) => {
        if (event.button !== 0) return

        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          frameId: frame.id,
          originClientX: event.clientX,
          originClientY: event.clientY,
          originX: layout.x,
          originY: layout.y,
          pointerId: event.pointerId,
        }
        setActiveFrameId(frame.id)
      },
    [],
  )

  const handleFrameHeaderPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      event.stopPropagation()
      const scale = Math.max(0.01, canvasController.canvasRef.current.scale)
      const nextX = Math.round(drag.originX + (event.clientX - drag.originClientX) / scale)
      const nextY = Math.round(drag.originY + (event.clientY - drag.originClientY) / scale)
      updateLayouts((current) => ({
        ...current,
        [drag.frameId]: {
          ...(current[drag.frameId] ?? { x: drag.originX, y: drag.originY }),
          x: nextX,
          y: nextY,
        },
      }))
    },
    [canvasController.canvasRef, updateLayouts],
  )

  const handleFrameHeaderPointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      event.stopPropagation()
      dragRef.current = undefined
      setActiveFrameId(undefined)
      persistLayouts()
    },
    [persistLayouts],
  )

  return (
    <main
      data-gtsx-studio-design-workspace="true"
      style={{
        ...studioShellStyle(),
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        aria-label="GTSX Studio design canvas viewport"
        data-gtsx-studio-design-viewport="true"
        onPointerCancel={canvasController.onCanvasPointerCancel}
        onPointerDown={canvasController.onCanvasPointerDown}
        onPointerMove={canvasController.onCanvasPointerMove}
        onPointerUp={canvasController.onCanvasPointerUp}
        ref={canvasController.setCanvasViewportElement}
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
        <ViewportPresetTabs floating onChange={setViewportPreset} selectedPreset={viewportPreset} />
        <div
          data-gtsx-canvas-surface="true"
          data-gtsx-studio-design-canvas="true"
          ref={canvasController.setCanvasSurfaceElement}
          style={{
            display: "block",
            left: 0,
            paddingBottom: 80,
            paddingRight: 80,
            position: "absolute",
            top: 0,
            transform: canvasSurfaceTransform,
            transformOrigin: "0px 0px",
          }}
        >
          {frames.length > 0 ? (
            frames.map((frame, index) => {
              const layout = layouts[frame.id] ?? defaultStudioDesignFrameLayout(index)
              const active = activeFrameId === frame.id
              return (
                <section
                  data-gtsx-studio-design-frame={frame.id}
                  key={frame.id}
                  style={{
                    display: "grid",
                    height: studioComponentCardTitleHeight + studioComponentCardTitleGap + frameSize.height,
                    position: "absolute",
                    transform: `translate(${layout.x}px, ${layout.y}px)`,
                    width: frameSize.width,
                  }}
                >
                  <div
                    data-gtsx-studio-design-frame-title="true"
                    onPointerCancel={handleFrameHeaderPointerEnd}
                    onPointerDown={handleFrameHeaderPointerDown(frame, layout)}
                    onPointerMove={handleFrameHeaderPointerMove}
                    onPointerUp={handleFrameHeaderPointerEnd}
                    style={{
                      ...studioCanvasScreenStableChromeSlotStyle({
                        height: studioComponentCardTitleHeight + studioComponentCardTitleGap,
                        width: frameSize.width,
                      }),
                      cursor: active ? "grabbing" : "grab",
                      touchAction: "none",
                      userSelect: "none",
                    }}
                  >
                    <span
                      data-gtsx-card-title-selected={active ? "true" : undefined}
                      style={{
                        ...studioCardTitleStyle(active),
                        ...studioCanvasScreenStableChromeContentBeforeCanvasAnchorStyle({
                          anchorCanvasLength: studioComponentCardTitleHeight + studioComponentCardTitleGap,
                          screenGapAfter: studioComponentCardTitleScreenGap,
                          screenLength: studioComponentCardTitleScreenHeight,
                        }),
                      }}
                      title={frame.title}
                    >
                      <span aria-hidden="true" style={studioCardTitleIndicatorStyle(active)} />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {frame.title}
                      </span>
                    </span>
                  </div>
                  <iframe
                    data-gtsx-studio-design-frame-preview="true"
                    src={studioDesignFramePreviewUrl(props.manifest, frame)}
                    style={{
                      background: "#ffffff",
                      border: `1px solid ${studioColors.panelBorder}`,
                      borderRadius: studioRadii.md,
                      boxShadow: active ? "0 18px 42px rgba(0,0,0,0.36)" : "0 10px 26px rgba(0,0,0,0.24)",
                      display: "block",
                      height: frameSize.height,
                      outline: active ? `1.6px solid ${studioColors.accentBorder}` : "0 solid transparent",
                      outlineOffset: 0,
                      overflow: "hidden",
                      pointerEvents: "none",
                      width: frameSize.width,
                    }}
                    title={frame.title}
                  />
                </section>
              )
            })
          ) : (
            <section
              data-gtsx-studio-design-empty="true"
              style={{
                background: studioColors.panelBg,
                border: `1px solid ${studioColors.panelBorder}`,
                borderRadius: studioRadii.md,
                color: studioColors.textMuted,
                display: "grid",
                fontFamily: studioFontFamily,
                fontSize: 12,
                gap: 6,
                left: 80,
                lineHeight: 1.4,
                padding: 18,
                position: "absolute",
                top: 120,
                width: 300,
              }}
            >
              <strong style={{ color: studioColors.text, fontSize: 12, fontWeight: 600 }}>No design frames</strong>
              <span>&lt;project.root&gt;/gtsx/design/*.g.tsx</span>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

function defaultStudioDesignFrameSize(): StudioDesignFrameSize {
  return studioDesignViewportSizes.tablet
}

function useStudioDesignFrameLayouts(frames: StudioDesignFrameEntry[], storageKey: string) {
  const [layouts, setLayouts] = React.useState<StudioDesignFrameLayouts>(() => createDefaultStudioDesignFrameLayouts(frames))
  const layoutsRef = React.useRef(layouts)

  const updateLayouts = React.useCallback((updater: (current: StudioDesignFrameLayouts) => StudioDesignFrameLayouts) => {
    setLayouts((current) => {
      const next = updater(current)
      layoutsRef.current = next
      return next
    })
  }, [])

  React.useEffect(() => {
    layoutsRef.current = layouts
  }, [layouts])

  React.useEffect(() => {
    const stored = readStoredStudioDesignFrameLayouts(storageKey)
    updateLayouts((current) => mergeStudioDesignFrameLayouts(frames, stored ?? current))
  }, [frames, storageKey, updateLayouts])

  const persistLayouts = React.useCallback(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(storageKey, JSON.stringify(layoutsRef.current))
  }, [storageKey])

  return { layouts, persistLayouts, updateLayouts }
}

function createDefaultStudioDesignFrameLayouts(frames: StudioDesignFrameEntry[]): StudioDesignFrameLayouts {
  return Object.fromEntries(frames.map((frame, index) => [frame.id, defaultStudioDesignFrameLayout(index)]))
}

function defaultStudioDesignFrameLayout(index: number): StudioDesignFrameLayout {
  const column = index % 3
  const row = Math.floor(index / 3)
  const size = defaultStudioDesignFrameSize()
  return {
    x: 96 + column * (size.width + studioDesignFrameColumnGap),
    y: 120 + row * (size.height + studioDesignFrameRowGap),
  }
}

function mergeStudioDesignFrameLayouts(
  frames: StudioDesignFrameEntry[],
  current: StudioDesignFrameLayouts,
): StudioDesignFrameLayouts {
  const defaults = createDefaultStudioDesignFrameLayouts(frames)
  const next: StudioDesignFrameLayouts = {}

  for (const frame of frames) {
    next[frame.id] = sanitizeStudioDesignFrameLayout(current[frame.id]) ?? defaults[frame.id] ?? defaultStudioDesignFrameLayout(0)
  }

  return next
}

function sanitizeStudioDesignFrameLayout(value: StudioDesignFrameLayout | undefined): StudioDesignFrameLayout | undefined {
  if (!value) return undefined
  if (![value.x, value.y].every(Number.isFinite)) return undefined

  return {
    x: Math.max(-2000, Math.min(20000, Math.round(value.x))),
    y: Math.max(-2000, Math.min(20000, Math.round(value.y))),
  }
}

function readStoredStudioDesignFrameLayouts(storageKey: string): StudioDesignFrameLayouts | undefined {
  if (typeof window === "undefined") return undefined

  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : undefined
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined

    return parsed as StudioDesignFrameLayouts
  } catch {
    return undefined
  }
}

function studioDesignWorkspaceStorageKey(manifest: StudioManifest): string {
  return `gtsx:studio:design-workspace:v2:${manifest.cache?.namespace ?? manifest.routes.manifest}`
}

function studioDesignFramePreviewUrl(manifest: StudioManifest, frame: StudioDesignFrameEntry): string {
  const url = replaceStudioDesignPreviewTemplate(manifest.preview.urlTemplate, {
    case: encodeURIComponent(frame.caseName),
    entry: encodeURIComponent(frame.entry),
    gcase: "",
  })
  return appendStudioDesignPreviewSearchParam(url, "chrome", "0")
}

function replaceStudioDesignPreviewTemplate(template: string, values: Record<string, string>): string {
  let next = template
  for (const [key, value] of Object.entries(values)) {
    next = next.split(`{${key}}`).join(value)
  }
  return next
}

function appendStudioDesignPreviewSearchParam(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

const StudioDesignWorkspace = React.memo(StudioDesignWorkspaceView) as typeof StudioDesignWorkspaceView & {
  cases?: GCases<StudioDesignWorkspaceProps>
}

export default StudioDesignWorkspace

StudioDesignWorkspace.cases = {
  designFrames: {
    props: {
      manifest: {
        version: 1,
        design: {
          frames: [
            {
              id: "src/gtsx/design/DesignHost.g.tsx#default",
              entry: "src/gtsx/design/DesignHost.g.tsx#default",
              filePath: "src/gtsx/design/DesignHost.g.tsx",
              title: "DesignHost",
              exportName: "default",
              caseName: "live",
            },
            {
              id: "src/gtsx/design/CreatorQueue.g.tsx#default",
              entry: "src/gtsx/design/CreatorQueue.g.tsx#default",
              filePath: "src/gtsx/design/CreatorQueue.g.tsx",
              title: "CreatorQueue",
              exportName: "default",
              caseName: "live",
            },
          ],
        },
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        preview: {
          urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
          allUrlTemplate: "/gtsx?entry={entry}{gcase}",
        },
        files: [],
        diagnostics: [],
      },
    },
  },
} satisfies GCases<StudioDesignWorkspaceProps>
