"use client"

import type { GCases } from "gtsx"

import type { StudioPreviewFrameSlot } from "../preview-frame-slot"

type BufferedPreviewIframeProps = {
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

export default function BufferedPreviewIframe(props: BufferedPreviewIframeProps) {
  return (
    <iframe
      aria-hidden="true"
      loading="eager"
      ref={(frame) => props.onPreviewFrameMount?.(props.slot.sessionId, frame)}
      src={props.slot.previewUrl}
      style={{
        background: "transparent",
        border: 0,
        height: props.size.height,
        left: 0,
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        width: props.size.width,
        zIndex: 1,
      }}
      tabIndex={-1}
      title={props.slot.title}
    />
  )
}

BufferedPreviewIframe.cases = {
  active: {
    props: {
      size: { width: 390, height: 844 },
      slot: {
        previewUrl: "/gtsx?entry=src%2FUserCard.g.tsx%23default&case=ready&chrome=0",
        sessionId: "src/UserCard.g.tsx#default:ready",
        title: "UserCard preview",
      },
    },
  },
} satisfies GCases<BufferedPreviewIframeProps>
