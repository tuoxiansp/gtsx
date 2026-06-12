export type RunelightPreviewViewportPreset = "desktop" | "phone" | "tablet"

export type RunelightPreviewFrameGridItemLayout = {
  height: number
  width: number
}

export type RunelightPreviewFrameGridLayout = {
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

export const runelightPreviewFixedFrameScale = 0.45
export const runelightPreviewScreenStableChromeMinimumScale = 0.75
export const runelightPreviewFrameGridGap = 14
export const runelightPreviewCardTitleScreenGap = 8
export const runelightPreviewCardTitleScreenHeight = 9
export const runelightPreviewFrameLabelScreenGap = 5
export const runelightPreviewFrameLabelScreenMinHeight = 13
export const runelightPreviewCardTitleGap = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewCardTitleScreenGap,
)
export const runelightPreviewCardTitleHeight = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewCardTitleScreenHeight,
)
export const runelightPreviewFrameLabelGap = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewFrameLabelScreenGap,
)
export const runelightPreviewFrameLabelMinHeight = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewFrameLabelScreenMinHeight,
)
export const runelightPreviewFrameChromeHeight =
  runelightPreviewFrameLabelGap + runelightPreviewFrameLabelMinHeight
export const runelightPreviewFrameGridMinScale = 0.18
export const runelightPreviewFrameMismatchBorderOutset = 2

export function runelightPreviewScreenStableChromeReservedLength(screenLength: number): number {
  return Math.ceil(screenLength / runelightPreviewScreenStableChromeMinimumScale)
}

export function runelightPreviewFrameGridMaxSide(
  viewportPreset: RunelightPreviewViewportPreset,
  frameCount: number,
): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return frameCount <= 1 ? Math.min(base, 720) : base
}

export function computeRunelightPreviewFrameGridLayout(input: {
  frameChromeHeight?: number
  gap?: number
  items: RunelightPreviewFrameGridItemLayout[]
  maxSide?: number
  minScale?: number
  previewScale?: number
}): RunelightPreviewFrameGridLayout {
  const gap = input.gap ?? 14
  const frameChromeHeight = input.frameChromeHeight ?? 20
  const maxSide = input.maxSide ?? 760
  const minScale = input.minScale ?? 0.24
  const items = input.items.length > 0 ? input.items : [{ height: 160, width: 280 }]
  const itemCount = items.length
  const maxItemWidth = Math.max(1, ...items.map((item) => item.width))
  const maxItemHeight = Math.max(1, ...items.map((item) => item.height))
  let bestLayout: RunelightPreviewFrameGridLayout | undefined
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
