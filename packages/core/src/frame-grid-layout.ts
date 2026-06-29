/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export type RunelightPreviewViewportPreset = "desktop" | "phone" | "tablet"

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export type RunelightPreviewFrameGridItemLayout = {
  height: number
  width: number
}

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
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

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFixedFrameScale = 0.45

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewScreenStableChromeMinimumScale = 0.75

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameGridGap = 14

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewCardTitleScreenGap = 8

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewCardTitleScreenHeight = 9

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameLabelScreenGap = 5

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameLabelScreenMinHeight = 13

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewCardTitleGap = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewCardTitleScreenGap,
)

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewCardTitleHeight = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewCardTitleScreenHeight,
)

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameLabelGap = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewFrameLabelScreenGap,
)

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameLabelMinHeight = runelightPreviewScreenStableChromeReservedLength(
  runelightPreviewFrameLabelScreenMinHeight,
)

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameChromeHeight =
  runelightPreviewFrameLabelGap + runelightPreviewFrameLabelMinHeight

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameGridMinScale = 0.18

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export const runelightPreviewFrameMismatchBorderOutset = 2

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export function runelightPreviewScreenStableChromeReservedLength(screenLength: number): number {
  return Math.ceil(screenLength / runelightPreviewScreenStableChromeMinimumScale)
}

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export function runelightPreviewFrameGridMaxSide(
  viewportPreset: RunelightPreviewViewportPreset,
  frameCount: number,
): number {
  const base = viewportPreset === "desktop" ? 860 : viewportPreset === "phone" ? 680 : 760
  return frameCount <= 1 ? Math.min(base, 720) : base
}

/**
 * @internal Shared preview geometry helper. Not a user-facing layout API.
 */
export function computeRunelightPreviewFrameGridLayout(input: {
  frameChromeHeight?: number
  gap?: number
  items: RunelightPreviewFrameGridItemLayout[]
  maxWidth?: number
  maxSide?: number
  minScale?: number
  previewScale?: number
}): RunelightPreviewFrameGridLayout {
  const gap = input.gap ?? 14
  const frameChromeHeight = input.frameChromeHeight ?? 20
  const maxSide = input.maxSide ?? 760
  const maxWidth = input.maxWidth ?? maxSide
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
      Math.min(1, maxWidth / naturalWidth, heightAvailableForPreviews / previewNaturalHeight),
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
    if (input.maxWidth !== undefined && columns > 1 && width > input.maxWidth) continue
    const aspectPenalty = Math.abs(Math.log(width / height))
    const scalePenalty = input.previewScale === undefined ? (1 - previewScale) * 0.35 : 0
    const emptySlotPenalty = (columns * rows - itemCount) * 0.08
    const overflowPenalty = input.previewScale === undefined ? 0 : Math.max(0, width - maxWidth, height - maxSide) / maxSide
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
