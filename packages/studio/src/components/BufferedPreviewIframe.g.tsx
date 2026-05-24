"use client"

import React from "react"
import { createGScope, type GCases } from "gtsx"

export type StudioPreviewFrameSlot = {
  previewUrl: string
  sessionId: string
  title: string
}

type BufferedPreviewIframeProps = {
  active: boolean
  onMeasureSize?: (size: { width: number; height: number }) => void
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

type BufferedPreviewIframeScope = {
  onLoad: React.ReactEventHandler<HTMLIFrameElement>
  setFrameElement: (frame: HTMLIFrameElement | null) => void
}

function useRealBufferedPreviewIframeScope(
  slot: StudioPreviewFrameSlot,
  onMeasureSize: ((size: { width: number; height: number }) => void) | undefined,
  onPreviewFrameMount: ((sessionId: string, frame: HTMLIFrameElement | null) => void) | undefined,
): BufferedPreviewIframeScope {
  const [frameElement, setFrameElementState] = React.useState<HTMLIFrameElement | null>(null)

  React.useEffect(() => {
    if (!frameElement) return

    const measure = () => {
      const size = measureIframeContentSize(frameElement)
      if (size) onMeasureSize?.(size)
    }
    const timers = [window.setTimeout(measure, 0), window.setTimeout(measure, 80), window.setTimeout(measure, 250)]
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [frameElement, onMeasureSize])

  return {
    onLoad(event) {
      const frame = event.currentTarget
      const measure = () => {
        const size = measureIframeContentSize(frame)
        if (size) onMeasureSize?.(size)
      }
      measure()
      window.setTimeout(measure, 80)
    },
    setFrameElement(frame) {
      setFrameElementState(frame)
      onPreviewFrameMount?.(slot.sessionId, frame)
    },
  }
}

const useBufferedPreviewIframeScope = createGScope(useRealBufferedPreviewIframeScope)

export default function BufferedPreviewIframe(props: BufferedPreviewIframeProps) {
  const scope = useBufferedPreviewIframeScope(props.slot, props.onMeasureSize, props.onPreviewFrameMount)

  return (
    <iframe
      aria-hidden={props.active ? undefined : true}
      loading="eager"
      onLoad={scope.onLoad}
      ref={scope.setFrameElement}
      src={props.slot.previewUrl}
      style={{
        background: "transparent",
        border: 0,
        height: props.size.height,
        opacity: props.active ? 1 : 0,
        pointerEvents: "none",
        position: "absolute",
        transition: "opacity 80ms linear",
        width: props.size.width,
        zIndex: props.active ? 1 : 0,
      }}
      tabIndex={props.active ? undefined : -1}
      title={props.slot.title}
    />
  )
}

BufferedPreviewIframe.cases = {
  active: {
    props: {
      active: true,
      size: { width: 390, height: 844 },
      slot: {
        previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
        sessionId: "src/UserCard.g.tsx#default:ready",
        title: "UserCard preview",
      },
    },
    scope: {
      onLoad() {},
      setFrameElement() {},
    },
  },
} satisfies GCases<BufferedPreviewIframeProps, BufferedPreviewIframeScope>

function measureIframeContentSize(frame: HTMLIFrameElement): { width: number; height: number } | undefined {
  const documentValue = frame.contentDocument
  if (!documentValue) return undefined

  const rects = [...documentValue.querySelectorAll<HTMLElement>("*")]
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0)

  if (rects.length === 0) {
    return {
      width: documentValue.documentElement.scrollWidth,
      height: documentValue.documentElement.scrollHeight,
    }
  }

  const left = Math.min(0, ...rects.map((rect) => rect.left))
  const top = Math.min(0, ...rects.map((rect) => rect.top))
  const right = Math.max(documentValue.documentElement.scrollWidth, ...rects.map((rect) => rect.right))
  const bottom = Math.max(documentValue.documentElement.scrollHeight, ...rects.map((rect) => rect.bottom))

  return {
    width: Math.ceil(right - left + 24),
    height: Math.ceil(bottom - top),
  }
}
