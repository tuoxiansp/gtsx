import type { GBoundaryRect } from "@gtsx/core"

type PreviewFrameSize = {
  height?: number
  width: number | string
}

type PreviewFrameBleed = {
  bottom: number
  left: number
  right: number
  top: number
}

const previewFrameVisualBleedPx = 16

export function previewFrameLayoutHeight(displaySize: { height: number }, rect: GBoundaryRect | undefined): number {
  if (!rect) return displaySize.height
  const bleed = previewFrameVisualBleed(displaySize, rect)
  return Math.max(1, Math.ceil(rect.height + bleed.top + bleed.bottom))
}

export function previewFrameLayoutWidth(displaySize: PreviewFrameSize, rect: GBoundaryRect | undefined): number | string {
  if (!rect) return displaySize.width
  const bleed = previewFrameVisualBleed(displaySize, rect)
  return Math.max(1, Math.ceil(rect.width + bleed.left + bleed.right))
}

export function previewFrameViewportOffset(rect: GBoundaryRect | undefined, bleed: PreviewFrameBleed): { x: number; y: number } {
  return {
    x: Math.max(0, Math.floor(rect?.x ?? 0) - bleed.left),
    y: Math.max(0, Math.floor(rect?.y ?? 0) - bleed.top),
  }
}

export function normalizeBoundaryRect(rect: GBoundaryRect | undefined, bleed: PreviewFrameBleed): GBoundaryRect | undefined {
  if (!rect) return undefined
  return {
    x: bleed.left,
    y: bleed.top,
    width: rect.width,
    height: rect.height,
  }
}

export function previewFrameVisualBleed(displaySize: Partial<PreviewFrameSize>, rect: GBoundaryRect | undefined): PreviewFrameBleed {
  if (!rect) return { bottom: 0, left: 0, right: 0, top: 0 }

  const viewportWidth = typeof displaySize.width === "number" ? displaySize.width : Number.POSITIVE_INFINITY
  return {
    bottom: Math.min(previewFrameVisualBleedPx, Math.max(0, (displaySize.height ?? Number.POSITIVE_INFINITY) - rect.y - rect.height)),
    left: Math.min(previewFrameVisualBleedPx, Math.max(0, rect.x)),
    right: Math.min(previewFrameVisualBleedPx, Math.max(0, viewportWidth - rect.x - rect.width)),
    top: Math.min(previewFrameVisualBleedPx, Math.max(0, rect.y)),
  }
}
