"use client"

import React from "react"
import { createGScopeHook, type GBoundaryRect, type GCases } from "@gtsx/core"

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
import { useStudioPreviewIsVisibleSession, useStudioPreviewShouldRenderSession } from "../preview-render-session-store"

type LazyPreviewFrameProps = {
  "data-gtsx-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
  debugIndicatorScale?: number
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  frameState?: StudioPreviewFrameState
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
  isVisibleRenderSession: boolean
  shouldLoadFromRenderQueue: boolean
}

function useRealLazyPreviewFrameScope(props: LazyPreviewFrameProps): LazyPreviewFrameScope {
  return {
    isVisibleRenderSession: useStudioPreviewIsVisibleSession(props.sessionId, props.debugPreviewQueue === true),
    shouldLoadFromRenderQueue: useStudioPreviewShouldRenderSession(props.sessionId),
  }
}

const useLazyPreviewFrameScope = createGScopeHook(useRealLazyPreviewFrameScope)

export default function LazyPreviewFrame(props: LazyPreviewFrameProps) {
  const [borrowOrigin, setBorrowOrigin] = React.useState<StudioPreviewIframeBorrowOrigin | null>(null)
  const scope = useLazyPreviewFrameScope(props)
  const shouldLoad = props.shouldLoad ?? scope.shouldLoadFromRenderQueue
  const layoutHeight = previewFrameLayoutHeight(props.size, props.boundaryRect)
  const layoutWidth = previewFrameLayoutWidth(props.size, props.boundaryRect)
  const visualBleed = previewFrameVisualBleed(props.size, props.boundaryRect)
  const viewportOffset = previewFrameViewportOffset(props.boundaryRect, visualBleed)
  const overlayRect = normalizeBoundaryRect(props.boundaryRect, visualBleed)
  const selectedOverlayRect = normalizeBoundaryRect(props.selectedBoundaryRect, visualBleed)
  const debugIndicatorScale = 1 / Math.max(props.debugIndicatorScale ?? 1, 0.01)
  const renderLifecycleState = studioPreviewRenderLifecycleDebugState(props.frameState, shouldLoad)
  const iframeOrigin = borrowOrigin ?? "pending"
  const renderFlowDebugState = studioPreviewRenderFlowDebugState({
    iframeOrigin,
    isVisibleRenderSession: scope.isVisibleRenderSession,
    renderLifecycleState,
    shouldLoad,
  })

  React.useEffect(() => {
    if (!shouldLoad) setBorrowOrigin(null)
  }, [shouldLoad])

  return (
    <div
      data-gtsx-preview-session-id={props["data-gtsx-preview-session-id"]}
      data-gtsx-preview-src={props.previewUrl}
      data-gtsx-viewport-preset={props.viewportPreset}
      style={{
        height: layoutHeight,
        overflow: "visible",
        position: "relative",
        width: layoutWidth,
      }}
    >
      {shouldLoad ? (
        <div
          data-gtsx-preview-clip="true"
          style={{
            contain: "layout paint style",
            height: layoutHeight,
            left: 0,
            overflow: "hidden",
            pointerEvents: "none",
            position: "absolute",
            top: 0,
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
              onBorrowOriginChange={props.debugPreviewPool || props.debugPreviewQueue ? setBorrowOrigin : undefined}
              onPreviewFrameMount={props.onPreviewFrameMount}
              size={props.size}
              slot={{
                previewUrl: props.previewUrl,
                sessionId: props.sessionId,
                title: props.title,
              }}
            />
          </div>
        </div>
      ) : null}
      {props.debugPreviewQueue ? (
        <span
          aria-label="Preview render lifecycle"
          data-gtsx-preview-render-flow={renderFlowDebugState}
          data-gtsx-preview-render-iframe-origin={iframeOrigin}
          data-gtsx-preview-render-lifecycle={renderLifecycleState}
          data-gtsx-preview-render-queued={shouldLoad ? "true" : "false"}
          data-gtsx-preview-render-visible={scope.isVisibleRenderSession ? "true" : "false"}
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(216,222,232,0.96)",
            borderRadius: 999,
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
          <StudioPreviewRenderLifecycleDot active={scope.isVisibleRenderSession} color="#0d99ff" />
          <StudioPreviewRenderLifecycleDot active={borrowOrigin !== null} color={borrowOrigin === "new" ? "#fb8f2d" : "#2da44e"} />
          <StudioPreviewRenderLifecycleDot active color={studioPreviewRenderLifecycleStateColor(renderLifecycleState)} />
        </span>
      ) : null}
      {props.debugPreviewQueue && shouldLoad && scope.isVisibleRenderSession ? (
        <span
          aria-label="Preview task dispatched from visible viewport"
          data-gtsx-preview-queue-origin="visible"
          style={{
            background: "#0d99ff",
            border: "1px solid rgba(255,255,255,0.92)",
            borderRadius: 999,
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
      {props.debugPreviewPool && shouldLoad && borrowOrigin ? (
        <span
          aria-label={borrowOrigin === "pool" ? "Preview iframe reused from pool" : "Preview iframe created"}
          data-gtsx-preview-pool-origin={borrowOrigin}
          style={{
            background: borrowOrigin === "pool" ? "#2da44e" : "#fb8f2d",
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
          title={borrowOrigin === "pool" ? "from pool" : "new iframe"}
        />
      ) : null}
      {overlayRect ? <ComponentBoundsHitTarget coordinate={props.coordinate} onSelect={props.onSelect} rect={overlayRect} /> : null}
      {selectedOverlayRect ? <SelectedBoundaryOutline rect={selectedOverlayRect} /> : null}
    </div>
  )
}

LazyPreviewFrame.cases = {
  loadedPhone: {
    props: {
      "data-gtsx-preview-session-id": "src/UserCard.g.tsx#default:ready",
      boundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      coordinate: "src/UserCard.g.tsx#default",
      previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
      selectedBoundaryRect: { x: 10, y: 20, width: 320, height: 88 },
      shouldLoad: true,
      size: { width: 390, height: 844 },
      sessionId: "src/UserCard.g.tsx#default:ready",
      title: "UserCard preview",
      viewportPreset: "phone",
    },
  },
} satisfies GCases<LazyPreviewFrameProps, LazyPreviewFrameScope>

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
  if (state === "queued") return "#0d99ff"
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
