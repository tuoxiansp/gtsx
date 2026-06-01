"use client"

import type { GCases } from "@gtsx/core"

import type { StudioPreviewFrameSlot } from "../preview-frame-slot"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { studioRadii } from "../studio-theme"

type BufferedPreviewIframeProps = {
  dimmed?: boolean
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

export default function BufferedPreviewIframe(props: BufferedPreviewIframeProps) {
  return (
    <>
      <iframe
        aria-hidden="true"
        loading="eager"
        ref={(frame) => props.onPreviewFrameMount?.(props.slot.sessionId, frame)}
        src={props.slot.previewUrl}
        style={{
          background: "transparent",
          border: 0,
          filter: props.dimmed ? "grayscale(0.9)" : undefined,
          height: props.size.height,
          left: 0,
          opacity: props.dimmed ? 0.42 : undefined,
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          width: props.size.width,
          zIndex: 1,
        }}
        tabIndex={-1}
        title={props.slot.title}
      />
      {props.dimmed ? (
        <div
          aria-hidden="true"
          data-gtsx-buffered-preview-dim-overlay={props.slot.sessionId}
          style={{
            background:
              "repeating-linear-gradient(135deg, rgba(87,96,106,0.34) 0, rgba(87,96,106,0.34) 6px, transparent 6px, transparent 12px)",
            borderRadius: studioRadii.md,
            inset: 0,
            pointerEvents: "none",
            position: "absolute",
            zIndex: 2,
          }}
        />
      ) : null}
    </>
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
