"use client"

import React from "react"

import BufferedPreviewIframe from "./BufferedPreviewIframe.g"
import { StudioPooledPreviewIframe, useStudioPreviewIframePool } from "../preview-iframe-pool"
import type { StudioPreviewIframeBorrowOrigin } from "../preview-iframe-pool"
import type { StudioPreviewFrameSlot } from "../preview-frame-slot"

type StudioPreviewIframeProps = {
  onBorrowOriginChange?: (origin: StudioPreviewIframeBorrowOrigin | null) => void
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

export default function StudioPreviewIframe(props: StudioPreviewIframeProps) {
  const pool = useStudioPreviewIframePool()

  React.useEffect(() => {
    if (pool) return
    props.onBorrowOriginChange?.("new")
    return () => props.onBorrowOriginChange?.(null)
  }, [pool, props.onBorrowOriginChange])

  return pool ? <StudioPooledPreviewIframe {...props} /> : <BufferedPreviewIframe {...props} />
}
