"use client"

import type { GCases } from "gtsx"

export type StudioPreviewFrameSlot = {
  previewUrl: string
  sessionId: string
  title: string
}

type BufferedPreviewIframeProps = {
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

export default function BufferedPreviewIframe(props: BufferedPreviewIframeProps) {
  return (
    <iframe
      loading="eager"
      ref={(frame) => props.onPreviewFrameMount?.(props.slot.sessionId, frame)}
      src={props.slot.previewUrl}
      style={{
        background: "transparent",
        border: 0,
        height: props.size.height,
        pointerEvents: "none",
        position: "absolute",
        width: props.size.width,
        zIndex: 1,
      }}
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
