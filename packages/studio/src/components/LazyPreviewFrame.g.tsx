"use client"

import React from "react"
import { createGScopeHook, type GBoundaryRect, type GCases } from "gtsx"

import BufferedPreviewIframe from "./BufferedPreviewIframe.g"
import ComponentBoundsHitTarget from "./ComponentBoundsHitTarget.g"
import SelectedBoundaryOutline from "./SelectedBoundaryOutline.g"
import {
  normalizeBoundaryRect,
  previewFrameLayoutHeight,
  previewFrameLayoutWidth,
  previewFrameViewportOffset,
  previewFrameVisualBleed,
} from "../preview-frame-layout"

type LazyPreviewFrameProps = {
  "data-gtsx-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
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

const studioPreviewPreloadMargin = 360

function useRealLazyPreviewFrameScope(): LazyPreviewFrameScope {
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)

  React.useEffect(() => {
    if (!containerElement) return

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true)
      return
    }

    if (isElementNearViewport(containerElement, studioPreviewPreloadMargin)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: `${studioPreviewPreloadMargin}px` },
    )
    observer.observe(containerElement)
    return () => observer.disconnect()
  }, [containerElement])

  return {
    shouldLoad,
    setContainerElement,
  }
}

const useLazyPreviewFrameScope = createGScopeHook(useRealLazyPreviewFrameScope)

export default function LazyPreviewFrame(props: LazyPreviewFrameProps) {
  const scope = useLazyPreviewFrameScope()
  const layoutHeight = previewFrameLayoutHeight(props.size, props.boundaryRect)
  const layoutWidth = previewFrameLayoutWidth(props.size, props.boundaryRect)
  const visualBleed = previewFrameVisualBleed(props.size, props.boundaryRect)
  const viewportOffset = previewFrameViewportOffset(props.boundaryRect, visualBleed)
  const overlayRect = normalizeBoundaryRect(props.boundaryRect, visualBleed)
  const selectedOverlayRect = normalizeBoundaryRect(props.selectedBoundaryRect, visualBleed)

  return (
    <div
      data-gtsx-preview-session-id={props["data-gtsx-preview-session-id"]}
      data-gtsx-preview-src={props.previewUrl}
      data-gtsx-viewport-preset={props.viewportPreset}
      ref={scope.setContainerElement}
      style={{
        contain: "layout paint style",
        containIntrinsicSize: `${layoutWidth}px ${layoutHeight}px`,
        contentVisibility: "auto",
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
            <BufferedPreviewIframe
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

function isElementNearViewport(element: HTMLElement, margin: number): boolean {
  const rect = element.getBoundingClientRect()
  return rect.bottom >= -margin && rect.right >= -margin && rect.top <= window.innerHeight + margin && rect.left <= window.innerWidth + margin
}
