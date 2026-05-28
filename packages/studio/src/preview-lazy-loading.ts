export const studioPreviewRenderBufferMargin = 3200

export type StudioViewportRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export type StudioCanvasPreviewVisibilityItem = {
  rect: StudioViewportRect
  sessionIds: readonly string[]
}

export type StudioCanvasPreviewVisibilityInput = {
  canvas: { x: number; y: number; scale: number }
  currentSessionIds?: ReadonlySet<string>
  items: readonly StudioCanvasPreviewVisibilityItem[]
  viewport: StudioViewportRect
}

export function visibleStudioPreviewSessionIds(input: StudioCanvasPreviewVisibilityInput): Set<string> {
  const visibleSessionIds = new Set<string>()
  const currentSessionIds = input.currentSessionIds ?? new Set<string>()

  for (const item of input.items) {
    const currentlyRendered = item.sessionIds.some((sessionId) => currentSessionIds.has(sessionId))
    if (!shouldRenderStudioPreview(currentlyRendered, studioCanvasRectToViewportRect(input.canvas, item.rect), input.viewport)) {
      continue
    }

    for (const sessionId of item.sessionIds) visibleSessionIds.add(sessionId)
  }

  return visibleSessionIds
}

export function shouldRenderStudioPreview(
  currentlyRendered: boolean,
  rect: StudioViewportRect,
  viewport: StudioViewportRect,
): boolean {
  return isRectNearViewport(rect, viewport, studioPreviewRenderBufferMargin)
}

export function studioCanvasRectToViewportRect(
  canvas: { x: number; y: number; scale: number },
  rect: StudioViewportRect,
): StudioViewportRect {
  return {
    bottom: canvas.y + rect.bottom * canvas.scale,
    left: canvas.x + rect.left * canvas.scale,
    right: canvas.x + rect.right * canvas.scale,
    top: canvas.y + rect.top * canvas.scale,
  }
}

export function isRectNearViewport(rect: StudioViewportRect, viewport: StudioViewportRect, margin: number): boolean {
  return (
    rect.bottom >= viewport.top - margin &&
    rect.right >= viewport.left - margin &&
    rect.top <= viewport.bottom + margin &&
    rect.left <= viewport.right + margin
  )
}
