export type RunelightStudioViewportPreset = "desktop" | "phone" | "tablet"

export type RunelightFrameGridItemLayout = {
  height: number
  width: number
}

export type RunelightFrameGridLayout = {
  frameChromeHeight: number
  cellHeight: number
  cellWidth: number
  columns: number
  gap: number
  height: number
  previewScale: number
  rows: number
  width: number
}

export const runelightStudioCanvasFixedFramePreviewScale = 0.45
export const runelightStudioCanvasScreenStableChromeMinimumScale = 0.75
export const runelightStudioComponentFrameGridGap = 14
export const runelightStudioComponentCardTitleScreenGap = 8
export const runelightStudioComponentCardTitleScreenHeight = 9
export const runelightStudioComponentFrameLabelScreenGap = 5
export const runelightStudioComponentFrameLabelScreenMinHeight = 13
export const runelightStudioComponentCardTitleGap = runelightStudioCanvasScreenStableChromeReservedLength(
  runelightStudioComponentCardTitleScreenGap,
)
export const runelightStudioComponentCardTitleHeight = runelightStudioCanvasScreenStableChromeReservedLength(
  runelightStudioComponentCardTitleScreenHeight,
)
export const runelightStudioComponentFrameLabelGap = runelightStudioCanvasScreenStableChromeReservedLength(
  runelightStudioComponentFrameLabelScreenGap,
)
export const runelightStudioComponentFrameLabelMinHeight = runelightStudioCanvasScreenStableChromeReservedLength(
  runelightStudioComponentFrameLabelScreenMinHeight,
)
export const runelightStudioComponentFrameChromeHeight =
  runelightStudioComponentFrameLabelGap + runelightStudioComponentFrameLabelMinHeight
export const runelightStudioComponentFrameGridMinScale = 0.18
export const runelightStudioComponentFrameMismatchBorderOutset = 2

export function runelightStudioCanvasScreenStableChromeReservedLength(screenLength: number): number {
  return Math.ceil(screenLength / runelightStudioCanvasScreenStableChromeMinimumScale)
}

export function runelightStudioFrameGridMaxSide(
  viewportPreset: RunelightStudioViewportPreset,
  frameCount: number,
): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return frameCount <= 1 ? Math.min(base, 720) : base
}

export function computeRunelightFrameGridLayout(input: {
  frameChromeHeight?: number
  gap?: number
  items: RunelightFrameGridItemLayout[]
  maxSide?: number
  minScale?: number
  previewScale?: number
}): RunelightFrameGridLayout {
  const gap = input.gap ?? 14
  const frameChromeHeight = input.frameChromeHeight ?? 20
  const maxSide = input.maxSide ?? 760
  const minScale = input.minScale ?? 0.24
  const items = input.items.length > 0 ? input.items : [{ height: 160, width: 280 }]
  const itemCount = items.length
  const maxItemWidth = Math.max(1, ...items.map((item) => item.width))
  const maxItemHeight = Math.max(1, ...items.map((item) => item.height))
  let bestLayout: RunelightFrameGridLayout | undefined
  let bestScore = Number.POSITIVE_INFINITY

  for (let columns = 1; columns <= itemCount; columns += 1) {
    const rows = Math.ceil(itemCount / columns)
    const naturalWidth = columns * maxItemWidth + (columns - 1) * gap
    const previewNaturalHeight = rows * maxItemHeight
    const chromeHeight = rows * frameChromeHeight + (rows - 1) * gap
    const heightAvailableForPreviews = Math.max(maxSide * minScale, maxSide - chromeHeight)
    const fittingPreviewScale = clampRunelightFrameGridNumber(
      Math.min(1, maxSide / naturalWidth, heightAvailableForPreviews / previewNaturalHeight),
      minScale,
      1,
    )
    const previewScale =
      input.previewScale === undefined
        ? fittingPreviewScale
        : clampRunelightFrameGridNumber(input.previewScale, minScale, 1)
    const cellWidth = Math.ceil(maxItemWidth * previewScale)
    const cellHeight = Math.ceil(frameChromeHeight + maxItemHeight * previewScale)
    const width = Math.ceil(columns * cellWidth + (columns - 1) * gap)
    const height = Math.ceil(rows * cellHeight + (rows - 1) * gap)
    const aspectPenalty = Math.abs(Math.log(width / height))
    const scalePenalty = input.previewScale === undefined ? (1 - previewScale) * 0.35 : 0
    const emptySlotPenalty = (columns * rows - itemCount) * 0.08
    const overflowPenalty = input.previewScale === undefined ? 0 : Math.max(0, width - maxSide, height - maxSide) / maxSide
    const score = aspectPenalty + scalePenalty + emptySlotPenalty + overflowPenalty * 4

    if (score < bestScore) {
      bestScore = score
      bestLayout = {
        frameChromeHeight,
        cellHeight,
        cellWidth,
        columns,
        gap,
        height,
        previewScale,
        rows,
        width,
      }
    }
  }

  return (
    bestLayout ?? {
      frameChromeHeight,
      cellHeight: frameChromeHeight + 160,
      cellWidth: 280,
      columns: 1,
      gap,
      height: frameChromeHeight + 160,
      previewScale: 1,
      rows: 1,
      width: 280,
    }
  )
}

function clampRunelightFrameGridNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
