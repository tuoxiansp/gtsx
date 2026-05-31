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

export function previewFrameVisualBleed(_displaySize: Partial<PreviewFrameSize>, _rect: GBoundaryRect | undefined): PreviewFrameBleed {
  return { bottom: 0, left: 0, right: 0, top: 0 }
}
