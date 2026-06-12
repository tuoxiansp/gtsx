import {
  runelightPreviewCardTitleGap,
  runelightPreviewCardTitleHeight,
  runelightPreviewCardTitleScreenGap,
  runelightPreviewCardTitleScreenHeight,
  runelightPreviewFrameChromeHeight,
  runelightPreviewFrameGridGap,
  runelightPreviewFrameGridMinScale,
  runelightPreviewFrameLabelGap,
  runelightPreviewFrameLabelMinHeight,
  runelightPreviewFrameLabelScreenGap,
  runelightPreviewFrameLabelScreenMinHeight,
  runelightPreviewFrameMismatchBorderOutset,
  runelightPreviewFrameGridMaxSide,
} from "@runelight/core/frame-grid-layout"

import type { StudioViewportPreset } from "./client"

export function studioFrameGridMaxSide(viewportPreset: StudioViewportPreset, frameCount: number): number {
  return runelightPreviewFrameGridMaxSide(viewportPreset, frameCount)
}

export const studioComponentFrameGridGap = runelightPreviewFrameGridGap
export const studioComponentCardTitleScreenGap = runelightPreviewCardTitleScreenGap
export const studioComponentCardTitleScreenHeight = runelightPreviewCardTitleScreenHeight
export const studioComponentFrameLabelScreenGap = runelightPreviewFrameLabelScreenGap
export const studioComponentFrameLabelScreenMinHeight = runelightPreviewFrameLabelScreenMinHeight
export const studioComponentCardTitleGap = runelightPreviewCardTitleGap
export const studioComponentCardTitleHeight = runelightPreviewCardTitleHeight
export const studioComponentFrameLabelGap = runelightPreviewFrameLabelGap
export const studioComponentFrameLabelMinHeight = runelightPreviewFrameLabelMinHeight
export const studioComponentFrameChromeHeight = runelightPreviewFrameChromeHeight
export const studioComponentFrameGridMinScale = runelightPreviewFrameGridMinScale
export const studioComponentFrameMismatchBorderOutset = runelightPreviewFrameMismatchBorderOutset
