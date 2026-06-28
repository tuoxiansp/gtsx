"use client"

import React from "react"
import { createGScopeHook, type GFrames } from "@runelight/react/runtime"
import type { GBoundaryRect } from "@runelight/core/boundary-rect"

import ComponentBoundsHitTarget from "./ComponentBoundsHitTarget.g"
import SelectedBoundaryOutline from "./SelectedBoundaryOutline.g"
import StudioPreviewIframe from "./StudioPreviewIframe"
import {
  normalizeBoundaryRect,
  previewFrameLayoutHeight,
  previewFrameLayoutWidth,
  previewFrameViewportOffset,
  previewFrameVisualBleed,
} from "../preview-frame-layout"
import type { StudioPreviewFrameState } from "../client"
import type { StudioPreviewIframeBorrowOrigin, StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { studioColors, studioRadii } from "../studio-theme"
import { useStudioPreviewIsVisibleSession, useStudioPreviewShouldRenderSession } from "../preview-render-session-store"

type LazyPreviewFrameProps = {
  "data-runelight-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
  debugIndicatorScale?: number
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  dimmed?: boolean
  frameState?: StudioPreviewFrameState
  layoutBoundaryRect?: GBoundaryRect
  layoutPending?: boolean
  layoutSize?: { height: number; width: number }
  onSelect?: () => void
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  previewUrl: string
  selectedBoundaryRect?: GBoundaryRect
  shouldLoad?: boolean
  size: { width: number | string; height: number }
  sessionId: string
  title: string
  viewportPreset: "phone" | "tablet" | "desktop"
}

type LazyPreviewFrameScope = {
  borrowOrigin: StudioPreviewIframeBorrowOrigin | null
  isVisibleRenderSession: boolean
  setBorrowOrigin: React.Dispatch<React.SetStateAction<StudioPreviewIframeBorrowOrigin | null>>
  shouldLoad: boolean
}

function useRealLazyPreviewFrameScope(props: LazyPreviewFrameProps): LazyPreviewFrameScope {
  const [borrowOrigin, setBorrowOrigin] = React.useState<StudioPreviewIframeBorrowOrigin | null>(null)
  const shouldLoadFromRenderQueue = useStudioPreviewShouldRenderSession(props.sessionId)
  const shouldLoad = props.shouldLoad ?? shouldLoadFromRenderQueue

  React.useEffect(() => {
    if (!shouldLoad) setBorrowOrigin(null)
  }, [shouldLoad])

  return {
    borrowOrigin,
    isVisibleRenderSession: useStudioPreviewIsVisibleSession(props.sessionId, props.debugPreviewQueue === true),
    setBorrowOrigin,
    shouldLoad,
  }
}

const useLazyPreviewFrameScope = createGScopeHook(useRealLazyPreviewFrameScope)

export default function LazyPreviewFrame(props: LazyPreviewFrameProps) {
  const scope = useLazyPreviewFrameScope(props)
  const shouldLoad = scope.shouldLoad
  const layoutBoundaryRect = props.layoutBoundaryRect ?? props.boundaryRect
  const layoutHeight = props.layoutSize?.height ?? previewFrameLayoutHeight(props.size, layoutBoundaryRect)
  const layoutWidth = props.layoutSize?.width ?? previewFrameLayoutWidth(props.size, layoutBoundaryRect)
  const visualBleed = previewFrameVisualBleed(props.size, layoutBoundaryRect)
  const viewportOffset = previewFrameViewportOffset(layoutBoundaryRect, visualBleed)
  const iframePlacementKey = `${layoutWidth}:${layoutHeight}:${viewportOffset.x}:${viewportOffset.y}:${props.debugIndicatorScale ?? 1}`
  const overlayRect = normalizeBoundaryRect(props.boundaryRect, visualBleed)
  const selectedOverlayRect = normalizeBoundaryRect(props.selectedBoundaryRect, visualBleed)
  const debugIndicatorScale = 1 / Math.max(props.debugIndicatorScale ?? 1, 0.01)
  const renderLifecycleState = studioPreviewRenderLifecycleDebugState(props.frameState, shouldLoad)
  const iframeOrigin = scope.borrowOrigin ?? "pending"
  const renderFlowDebugState = studioPreviewRenderFlowDebugState({
    iframeOrigin,
    isVisibleRenderSession: scope.isVisibleRenderSession,
    renderLifecycleState,
    shouldLoad,
  })

  return (
    <div
      data-runelight-preview-session-id={props["data-runelight-preview-session-id"]}
      data-runelight-preview-src={props.previewUrl}
      data-runelight-preview-layout-pending={props.layoutPending ? "true" : undefined}
      data-runelight-viewport-preset={props.viewportPreset}
      style={{
        height: layoutHeight,
        overflow: "visible",
        position: "relative",
        width: layoutWidth,
      }}
    >
      {shouldLoad ? (
        <div
          data-runelight-preview-clip="true"
          style={{
            borderRadius: props.dimmed ? studioRadii.md : undefined,
            contain: "layout paint style",
            height: layoutHeight,
            left: 0,
            overflow: "hidden",
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            visibility: props.layoutPending ? "hidden" : undefined,
            width: layoutWidth,
            zIndex: 1,
          }}
        >
          <div
            style={{
              height: props.size.height,
              left: -viewportOffset.x,
              position: "absolute",
              top: -viewportOffset.y,
              width: props.size.width,
            }}
          >
            <StudioPreviewIframe
              onBorrowOriginChange={props.debugPreviewPool || props.debugPreviewQueue ? scope.setBorrowOrigin : undefined}
              onPreviewFrameMount={props.onPreviewFrameMount}
              dimmed={props.dimmed}
              placementKey={iframePlacementKey}
              size={props.size}
              slot={{
                previewUrl: props.previewUrl,
                sessionId: props.sessionId,
                title: props.title,
              }}
            />
          </div>
          {props.dimmed ? (
            <div
              aria-hidden="true"
              data-runelight-preview-dim-overlay={props.sessionId}
              style={{
                background:
                  "repeating-linear-gradient(135deg, rgba(87,96,106,0.34) 0, rgba(87,96,106,0.34) 6px, transparent 6px, transparent 12px)",
                borderRadius: studioRadii.md,
                height: layoutHeight,
                left: 0,
                pointerEvents: "none",
                position: "absolute",
                top: 0,
                width: layoutWidth,
                zIndex: 2,
              }}
            />
          ) : null}
        </div>
      ) : null}
      {props.debugPreviewQueue ? (
        <span
          aria-label="Preview render lifecycle"
          data-runelight-preview-render-flow={renderFlowDebugState}
          data-runelight-preview-render-iframe-origin={iframeOrigin}
          data-runelight-preview-render-lifecycle={renderLifecycleState}
          data-runelight-preview-render-queued={shouldLoad ? "true" : "false"}
          data-runelight-preview-render-visible={scope.isVisibleRenderSession ? "true" : "false"}
          style={{
            alignItems: "center",
            background: studioColors.panelBg,
            border: `1px solid ${studioColors.panelBorder}`,
            borderRadius: studioRadii.pill,
            bottom: 5,
            boxShadow: "0 1px 5px rgba(31,35,40,0.16)",
            display: "grid",
            gap: 3,
            gridTemplateColumns: "repeat(4, 6px)",
            height: 12,
            justifyContent: "center",
            padding: "0 4px",
            pointerEvents: "none",
            position: "absolute",
            right: 5,
            transform: `scale(${debugIndicatorScale})`,
            transformOrigin: "bottom right",
            zIndex: 5,
          }}
          title={renderFlowDebugState}
        >
          <StudioPreviewRenderLifecycleDot active={shouldLoad} color="#57606a" />
          <StudioPreviewRenderLifecycleDot active={scope.isVisibleRenderSession} color={studioColors.accent} />
          <StudioPreviewRenderLifecycleDot
            active={scope.borrowOrigin !== null}
            color={scope.borrowOrigin === "new" ? "#fb8f2d" : "#2da44e"}
          />
          <StudioPreviewRenderLifecycleDot active color={studioPreviewRenderLifecycleStateColor(renderLifecycleState)} />
        </span>
      ) : null}
      {props.debugPreviewQueue && shouldLoad && scope.isVisibleRenderSession ? (
        <span
          aria-label="Preview task dispatched from visible viewport"
          data-runelight-preview-queue-origin="visible"
          style={{
            background: studioColors.accent,
            border: `1px solid ${studioColors.panelBorder}`,
            borderRadius: studioRadii.pill,
            boxShadow: "0 1px 5px rgba(31,35,40,0.25)",
            height: 9,
            pointerEvents: "none",
            position: "absolute",
            right: props.debugPreviewPool ? 18 : 5,
            top: 5,
            transform: `scale(${debugIndicatorScale})`,
            transformOrigin: "top right",
            width: 9,
            zIndex: 4,
          }}
          title="visible queue task"
        />
      ) : null}
      {props.debugPreviewPool && shouldLoad && scope.borrowOrigin ? (
        <span
          aria-label={scope.borrowOrigin === "pool" ? "Preview iframe reused from pool" : "Preview iframe created"}
          data-runelight-preview-pool-origin={scope.borrowOrigin}
          style={{
            background: scope.borrowOrigin === "pool" ? "#2da44e" : "#fb8f2d",
            border: "1px solid rgba(255,255,255,0.92)",
            borderRadius: 999,
            boxShadow: "0 1px 5px rgba(31,35,40,0.25)",
            height: 9,
            pointerEvents: "none",
            position: "absolute",
            right: 5,
            top: 5,
            transform: `scale(${debugIndicatorScale})`,
            transformOrigin: "top right",
            width: 9,
            zIndex: 4,
          }}
          title={scope.borrowOrigin === "pool" ? "from pool" : "new iframe"}
        />
      ) : null}
      {props.boundaryRect ? (
        <ComponentBoundsHitTarget coordinate={props.coordinate} onSelect={props.onSelect} rect={overlayRect ?? props.boundaryRect} />
      ) : null}
      {props.selectedBoundaryRect ? <SelectedBoundaryOutline rect={selectedOverlayRect ?? props.selectedBoundaryRect} /> : null}
    </div>
  )
}

LazyPreviewFrame.frames = {
  loadedPhone: {
    description: "loadedPhone frame",
    props: {
      "data-runelight-preview-session-id": "src/UserCard.g.tsx#default:ready",
      boundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      coordinate: "src/UserCard.g.tsx#default",
      previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
      selectedBoundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      shouldLoad: true,
      size: { width: 390, height: 844 },
      sessionId: "src/UserCard.g.tsx#default:ready",
      title: "UserCard preview",
      viewportPreset: "phone",
    },
  },
  debugQueue: {
    description: "debugQueue frame",
    props: {
      "data-runelight-preview-session-id": "src/UserCard.g.tsx#default:ready",
      boundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      coordinate: "src/UserCard.g.tsx#default",
      debugPreviewQueue: true,
      frameState: {
        expectedSessionId: "src/UserCard.g.tsx#default:ready",
        ready: true,
      },
      previewUrl: "/runelight?entry=src%2FUserCard.g.tsx%23default&frame=ready&chrome=0",
      selectedBoundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      shouldLoad: true,
      size: { width: 390, height: 844 },
      sessionId: "src/UserCard.g.tsx#default:ready",
      title: "UserCard preview",
      viewportPreset: "phone",
    },
  },
} satisfies GFrames<LazyPreviewFrameProps, LazyPreviewFrameScope>

function studioPreviewRenderFlowDebugState(input: {
  iframeOrigin: StudioPreviewIframeBorrowOrigin | "pending"
  isVisibleRenderSession: boolean
  renderLifecycleState: "error" | "idle" | "queued" | "ready" | "rendering"
  shouldLoad: boolean
}): string {
  return [
    input.shouldLoad ? "queued" : "not-queued",
    input.isVisibleRenderSession ? "visible" : "buffer",
    `iframe-${input.iframeOrigin}`,
    input.renderLifecycleState,
  ].join(" -> ")
}

function studioPreviewRenderLifecycleDebugState(
  frameState: StudioPreviewFrameState | undefined,
  shouldLoad: boolean,
): "error" | "idle" | "queued" | "ready" | "rendering" {
  if (frameState?.error) return "error"
  if (frameState?.ready) return "ready"
  if (shouldLoad && frameState) return "rendering"
  if (shouldLoad) return "queued"
  return "idle"
}

function studioPreviewRenderLifecycleStateColor(state: "error" | "idle" | "queued" | "ready" | "rendering"): string {
  if (state === "error") return "#cf222e"
  if (state === "ready") return "#2da44e"
  if (state === "rendering") return "#bf8700"
  if (state === "queued") return studioColors.accent
  return "#8c959f"
}

function StudioPreviewRenderLifecycleDot(props: { active: boolean; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        background: props.active ? props.color : "rgba(140,149,159,0.22)",
        borderRadius: 999,
        display: "block",
        height: 6,
        width: 6,
      }}
    />
  )
}
