import type { CSSProperties } from "react"

type StudioCanvasScale = {
  scale: number
}

const studioCanvasScreenStableChromeScaleProperty = "--gtsx-studio-screen-stable-chrome-scale"
const studioCanvasScreenStableChromeContentSizeProperty = "--gtsx-studio-screen-stable-chrome-content-size"
const studioCanvasScreenStableChromeBorderWidthProperty = "--gtsx-studio-screen-stable-chrome-border-width"
const studioCanvasScreenStableChromeBorderWidthPixels = 1.2

export const studioCanvasScreenStableChromeMinimumStableCanvasScale = 0.75

export function studioCanvasScreenStableChromeReservedCanvasLength(screenLength: number): number {
  return Math.ceil(screenLength / studioCanvasScreenStableChromeMinimumStableCanvasScale)
}

export function studioCanvasScreenStableChromeHostStyle(canvas: StudioCanvasScale): CSSProperties {
  return {
    [studioCanvasScreenStableChromeScaleProperty]: formatStudioCanvasScreenStableChromeNumber(
      studioCanvasScreenStableChromeScale(canvas),
    ),
    [studioCanvasScreenStableChromeBorderWidthProperty]: studioCanvasScreenStableChromeBorderWidthValue(canvas),
    [studioCanvasScreenStableChromeContentSizeProperty]: studioCanvasScreenStableChromeContentSize(canvas),
  } as CSSProperties
}

export function writeStudioCanvasScreenStableChromeHostStyle(element: HTMLElement, canvas: StudioCanvasScale) {
  element.style.setProperty(
    studioCanvasScreenStableChromeScaleProperty,
    formatStudioCanvasScreenStableChromeNumber(studioCanvasScreenStableChromeScale(canvas)),
  )
  element.style.setProperty(studioCanvasScreenStableChromeBorderWidthProperty, studioCanvasScreenStableChromeBorderWidthValue(canvas))
  element.style.setProperty(studioCanvasScreenStableChromeContentSizeProperty, studioCanvasScreenStableChromeContentSize(canvas))
}

export function studioCanvasScreenStableChromeSlotStyle(input: {
  height: number
  justifyItems?: CSSProperties["justifyItems"]
  width?: number | string
}): CSSProperties {
  return {
    alignContent: "start",
    alignItems: "start",
    display: "grid",
    height: input.height,
    justifyItems: input.justifyItems,
    minWidth: 0,
    overflow: "visible",
    width: input.width,
  }
}

export function studioCanvasScreenStableChromeContentStyle(transformOrigin: CSSProperties["transformOrigin"] = "top left"): CSSProperties {
  return {
    transform: studioCanvasScreenStableChromeTransform(),
    transformOrigin,
    width: `var(${studioCanvasScreenStableChromeContentSizeProperty}, 100%)`,
  }
}

export function studioCanvasScreenStableChromeContentBeforeCanvasAnchorStyle(input: {
  anchorCanvasLength: number
  screenGapAfter: number
  screenLength: number
  transformOrigin?: CSSProperties["transformOrigin"]
}): CSSProperties {
  return {
    ...studioCanvasScreenStableChromeContentStyle(input.transformOrigin),
    position: "relative",
    top: input.anchorCanvasLength,
    transform: studioCanvasScreenStableChromeTransform(-(input.screenLength + input.screenGapAfter)),
  }
}

export function studioCanvasScreenStableChromeContentAfterCanvasGapStyle(input: {
  reservedCanvasGap: number
  screenGapBefore: number
  transformOrigin?: CSSProperties["transformOrigin"]
}): CSSProperties {
  return {
    ...studioCanvasScreenStableChromeContentStyle(input.transformOrigin),
    position: "relative",
    top: -input.reservedCanvasGap,
    transform: studioCanvasScreenStableChromeTransform(input.screenGapBefore),
  }
}

export function studioCanvasScreenStableChromeBorderWidth(): string {
  return `var(${studioCanvasScreenStableChromeBorderWidthProperty}, ${studioCanvasScreenStableChromeBorderWidthPixels}px)`
}

function studioCanvasScreenStableChromeScale(canvas: StudioCanvasScale): number {
  return 1 / studioCanvasScreenStableChromeVisibleCanvasScale(canvas)
}

function studioCanvasScreenStableChromeBorderWidthValue(canvas: StudioCanvasScale): string {
  return `${formatStudioCanvasScreenStableChromeNumber(
    studioCanvasScreenStableChromeScale(canvas) * studioCanvasScreenStableChromeBorderWidthPixels,
  )}px`
}

function studioCanvasScreenStableChromeContentSize(canvas: StudioCanvasScale): string {
  return `${formatStudioCanvasScreenStableChromeNumber(studioCanvasScreenStableChromeVisibleCanvasScale(canvas) * 100)}%`
}

function studioCanvasScreenStableChromeVisibleCanvasScale(canvas: StudioCanvasScale): number {
  return Math.max(studioCanvasScreenStableChromeMinimumStableCanvasScale, canvas.scale, 0.01)
}

function formatStudioCanvasScreenStableChromeNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function studioCanvasScreenStableChromeTransform(translateY?: number): string {
  const scale = `scale(var(${studioCanvasScreenStableChromeScaleProperty}, 1))`
  return translateY === undefined ? scale : `${scale} translateY(${formatStudioCanvasScreenStableChromeNumber(translateY)}px)`
}
