"use client"

import React from "react"
import { createGScopeHook, type GBoundaryRect, type GCases } from "gtsx"

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
import {
  studioPreviewLoadCheckEvent,
  studioPreviewPreloadMargin,
  shouldRenderElementPreview,
} from "../preview-lazy-loading"
import type { StudioPreviewIframeBorrowOrigin } from "../preview-iframe-pool"

type LazyPreviewFrameProps = {
  "data-gtsx-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
  debugIndicatorScale?: number
  debugPreviewPool?: boolean
  onSelect?: () => void
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  previewUrl: string
  selectedBoundaryRect?: GBoundaryRect
  size: { width: number | string; height: number }
  sessionId: string
  title: string
  viewportPreset: "phone" | "tablet" | "desktop"
}

type LazyPreviewFrameScope = {
  shouldLoad: boolean
  setContainerElement: (element: HTMLDivElement | null) => void
}

function useRealLazyPreviewFrameScope(): LazyPreviewFrameScope {
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)

  React.useEffect(() => {
    if (!containerElement) return

    const updateLoadState = () => {
      setShouldLoad((current) => shouldRenderElementPreview(containerElement, current))
    }

    let scheduledFrame = 0
    const scheduleLoadCheck = () => {
      if (scheduledFrame) return
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0
        updateLoadState()
      })
    }

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) setShouldLoad(true)
            },
            { rootMargin: `${studioPreviewPreloadMargin}px` },
          )
        : undefined
    observer?.observe(containerElement)
    window.addEventListener(studioPreviewLoadCheckEvent, scheduleLoadCheck)
    window.addEventListener("resize", scheduleLoadCheck)
    scheduleLoadCheck()
    return () => {
      observer?.disconnect()
      window.removeEventListener(studioPreviewLoadCheckEvent, scheduleLoadCheck)
      window.removeEventListener("resize", scheduleLoadCheck)
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  }, [containerElement])

  return {
    shouldLoad,
    setContainerElement,
  }
}

const useLazyPreviewFrameScope = createGScopeHook(useRealLazyPreviewFrameScope)

export default function LazyPreviewFrame(props: LazyPreviewFrameProps) {
  const scope = useLazyPreviewFrameScope()
  const [borrowOrigin, setBorrowOrigin] = React.useState<StudioPreviewIframeBorrowOrigin | null>(null)
  const layoutHeight = previewFrameLayoutHeight(props.size, props.boundaryRect)
  const layoutWidth = previewFrameLayoutWidth(props.size, props.boundaryRect)
  const visualBleed = previewFrameVisualBleed(props.size, props.boundaryRect)
  const viewportOffset = previewFrameViewportOffset(props.boundaryRect, visualBleed)
  const overlayRect = normalizeBoundaryRect(props.boundaryRect, visualBleed)
  const selectedOverlayRect = normalizeBoundaryRect(props.selectedBoundaryRect, visualBleed)
  const debugIndicatorScale = 1 / Math.max(props.debugIndicatorScale ?? 1, 0.01)

  React.useEffect(() => {
    if (!scope.shouldLoad) setBorrowOrigin(null)
  }, [scope.shouldLoad])

  return (
    <div
      data-gtsx-preview-session-id={props["data-gtsx-preview-session-id"]}
      data-gtsx-preview-src={props.previewUrl}
      data-gtsx-viewport-preset={props.viewportPreset}
      ref={scope.setContainerElement}
      style={{
        height: layoutHeight,
        overflow: "visible",
        position: "relative",
        width: layoutWidth,
      }}
    >
      {scope.shouldLoad ? (
        <div
          data-gtsx-preview-clip="true"
          style={{
            contain: "layout paint style",
            containIntrinsicSize: `${layoutWidth}px ${layoutHeight}px`,
            contentVisibility: "auto",
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
              onBorrowOriginChange={props.debugPreviewPool ? setBorrowOrigin : undefined}
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
      {props.debugPreviewPool && scope.shouldLoad && borrowOrigin ? (
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
      size: { width: 390, height: 844 },
      sessionId: "src/UserCard.g.tsx#default:ready",
      title: "UserCard preview",
      viewportPreset: "phone",
    },
    scope: {
      shouldLoad: true,
      setContainerElement() {},
    },
  },
} satisfies GCases<LazyPreviewFrameProps, LazyPreviewFrameScope>
