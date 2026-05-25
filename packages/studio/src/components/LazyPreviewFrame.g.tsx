"use client"

import React from "react"
import { createGScopeHook, type GBoundaryRect, type GCases } from "gtsx"

import BufferedPreviewIframe from "./BufferedPreviewIframe.g"
import ComponentBoundsHitTarget from "./ComponentBoundsHitTarget.g"
import SelectedBoundaryOutline from "./SelectedBoundaryOutline.g"

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

const studioPreviewPreloadMargin = 1200

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
        width: props.size.width,
      }}
    >
      {scope.shouldLoad ? (
        <BufferedPreviewIframe
          onPreviewFrameMount={props.onPreviewFrameMount}
          size={props.size}
          slot={{
            previewUrl: props.previewUrl,
            sessionId: props.sessionId,
            title: props.title,
          }}
        />
      ) : null}
      {props.boundaryRect ? <ComponentBoundsHitTarget coordinate={props.coordinate} onSelect={props.onSelect} rect={props.boundaryRect} /> : null}
      {props.selectedBoundaryRect ? <SelectedBoundaryOutline rect={props.selectedBoundaryRect} /> : null}
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

function previewFrameLayoutHeight(displaySize: { height: number }, rect: GBoundaryRect | undefined): number {
  if (!rect) return displaySize.height
  return Math.max(1, Math.ceil(Math.max(0, rect.y) + rect.height))
}

function isElementNearViewport(element: HTMLElement, margin: number): boolean {
  const rect = element.getBoundingClientRect()
  return rect.bottom >= -margin && rect.right >= -margin && rect.top <= window.innerHeight + margin && rect.left <= window.innerWidth + margin
}
