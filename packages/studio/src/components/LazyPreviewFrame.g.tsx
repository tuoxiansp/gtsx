"use client"

import React from "react"
import { createGScope, type GBoundaryRect, type GBoundaryTreeNode, type GCases } from "gtsx"

import BufferedPreviewIframe, { type StudioPreviewFrameSlot } from "./BufferedPreviewIframe.g"
import ComponentBoundsHitTarget from "./ComponentBoundsHitTarget.g"
import SelectedBoundaryOutline from "./SelectedBoundaryOutline.g"

type LazyPreviewFrameProps = {
  "data-gtsx-preview-session-id": string
  boundaryRect?: GBoundaryRect
  coordinate: string
  frameState?: {
    tree?: GBoundaryTreeNode[]
  }
  onMeasureSize?: (size: { width: number; height: number }) => void
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
  frameSlots: { active: boolean; slot: StudioPreviewFrameSlot }[]
  setContainerElement: (element: HTMLDivElement | null) => void
}

const studioPreviewPreloadMargin = 1200

function useRealLazyPreviewFrameScope(
  previewUrl: string,
  sessionId: string,
  title: string,
  frameState: { tree?: GBoundaryTreeNode[] } | undefined,
): LazyPreviewFrameScope {
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const requestedSlot = React.useMemo(
    () => ({
      previewUrl,
      sessionId,
      title,
    }),
    [previewUrl, sessionId, title],
  )
  const [activeSlot, setActiveSlot] = React.useState<StudioPreviewFrameSlot>(requestedSlot)
  const [pendingSlot, setPendingSlot] = React.useState<StudioPreviewFrameSlot | undefined>()

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

  React.useEffect(() => {
    if (!shouldLoad) return
    if (isSamePreviewFrameSlot(activeSlot, requestedSlot)) {
      setPendingSlot(undefined)
      return
    }

    setPendingSlot((current) => {
      if (current && isSamePreviewFrameSlot(current, requestedSlot)) return current
      return requestedSlot
    })
  }, [activeSlot, requestedSlot, shouldLoad])

  React.useEffect(() => {
    if (!pendingSlot || !isSamePreviewFrameSlot(pendingSlot, requestedSlot)) return
    if (!frameState?.tree) return

    setActiveSlot(pendingSlot)
    setPendingSlot(undefined)
  }, [frameState?.tree, pendingSlot, requestedSlot])

  return {
    frameSlots: shouldLoad
      ? [
          { active: true, slot: activeSlot },
          ...(pendingSlot && !isSamePreviewFrameSlot(pendingSlot, activeSlot) ? [{ active: false, slot: pendingSlot }] : []),
        ]
      : [],
    setContainerElement,
  }
}

const useLazyPreviewFrameScope = createGScope(useRealLazyPreviewFrameScope)

export default function LazyPreviewFrame(props: LazyPreviewFrameProps) {
  const scope = useLazyPreviewFrameScope(props.previewUrl, props.sessionId, props.title, props.frameState)
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
      {scope.frameSlots.map(({ active, slot }) => (
        <BufferedPreviewIframe
          active={active}
          key={previewFrameSlotKey(slot)}
          onMeasureSize={props.onMeasureSize}
          onPreviewFrameMount={props.onPreviewFrameMount}
          size={props.size}
          slot={slot}
        />
      ))}
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
      frameSlots: [
        {
          active: true,
          slot: {
            previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
            sessionId: "src/UserCard.g.tsx#default:ready",
            title: "UserCard preview",
          },
        },
      ],
      setContainerElement() {},
    },
  },
} satisfies GCases<LazyPreviewFrameProps, LazyPreviewFrameScope>

function previewFrameLayoutHeight(displaySize: { height: number }, rect: GBoundaryRect | undefined): number {
  if (!rect) return displaySize.height
  return Math.max(1, Math.ceil(Math.max(0, rect.y) + rect.height))
}

function isSamePreviewFrameSlot(left: StudioPreviewFrameSlot, right: StudioPreviewFrameSlot): boolean {
  return left.previewUrl === right.previewUrl && left.sessionId === right.sessionId
}

function previewFrameSlotKey(slot: StudioPreviewFrameSlot): string {
  return `${slot.sessionId}\n${slot.previewUrl}`
}

function isElementNearViewport(element: HTMLElement, margin: number): boolean {
  const rect = element.getBoundingClientRect()
  return rect.bottom >= -margin && rect.right >= -margin && rect.top <= window.innerHeight + margin && rect.left <= window.innerWidth + margin
}
