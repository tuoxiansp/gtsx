"use client"

import type { GBoundaryRect } from "@gtsx/core"

import {
  clipPreviewBoundaryRectToViewport,
  computeStudioFrameGridLayout,
  mergeStudioPreviewFrameState,
  previewSessionId,
  studioPreviewCacheKey,
  studioPreviewFrameSize,
  type StudioCanvasScreenRect,
  type StudioCanvasTransform,
  type StudioFrameGridLayout,
  type StudioFrameGridItemLayout,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "./client"
import {
  studioFrameGridMaxSide,
  studioComponentCardTitleGap,
  studioComponentCardTitleHeight,
  studioComponentFrameChromeHeight,
  studioComponentFrameGridGap,
  studioComponentFrameGridMinScale,
} from "./frame-grid-layout"
import { previewFrameLayoutHeight, previewFrameLayoutWidth } from "./preview-frame-layout"
import {
  studioPreviewRenderBufferMargin,
  type StudioCanvasPreviewVisibilityItem,
  type StudioViewportRect,
} from "./preview-lazy-loading"
import type { StudioManifestComponent } from "./manifest"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"
import { studioComponentFrameLayoutFrameStates } from "./studio-component-preview-frame-states"
import { studioBoundaryRectForCoordinate } from "./boundary-tree"

export type StudioComponentCardLayout = {
  frameGridLayout: StudioFrameGridLayout
  frameGridItems: StudioFrameGridItemLayout[]
  height: number
  width: number
}

export type StudioCanvasCardIndexEntry = {
  columnIndex: number
  component: StudioManifestComponent
  pathKey: string
  rect?: StudioCanvasScreenRect
}

export type StudioCanvasCardIndex = {
  byColumnIndex: Record<number, StudioCanvasCardIndexEntry[]>
  byPathKey: Record<string, StudioCanvasCardIndexEntry>
  complete: boolean
}

export type MeasuredStudioColumnCardLayout = {
  height: number
  previewFrameRectsBySessionId?: Record<string, StudioCanvasScreenRect>
  width: number
}

const studioComponentCardColumnGap = 5
const studioCanvasCardShellViewportStabilityMargin = 24
const studioMeasuredCanvasLengthPrecision = 100
export const studioCanvasFixedFramePreviewScale = 0.45

export function domRectToStudioCanvasScreenRect(rect: DOMRect): StudioCanvasScreenRect {
  return {
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    top: rect.top,
  }
}

export function domRectToLocalStudioCanvasScreenRect(
  rect: DOMRect,
  originRect: DOMRect,
  scale: number,
): StudioCanvasScreenRect {
  return {
    bottom: stableMeasuredCanvasLength((rect.bottom - originRect.top) / scale),
    left: stableMeasuredCanvasLength((rect.left - originRect.left) / scale),
    right: stableMeasuredCanvasLength((rect.right - originRect.left) / scale),
    top: stableMeasuredCanvasLength((rect.top - originRect.top) / scale),
  }
}

export function studioCanvasTransformStyle(canvas: StudioCanvasTransform): string {
  return `translate(${canvas.x}px, ${canvas.y}px) scale(${canvas.scale})`
}

export function studioComponentPathForColumn(
  workspace: StudioWorkspaceState,
  columnIndex: number,
  coordinate: string,
): string[] {
  return [...workspace.selectedCoordinatePath.slice(0, columnIndex), coordinate]
}

export function studioPathKey(path: string[]): string {
  return path.join("\n")
}

export function columnCardElementKey(columnIndex: number, coordinate: string): string {
  return `${columnIndex}\n${coordinate}`
}

export function studioWorkspaceLayoutMeasurementKey(
  workspace: StudioWorkspaceState,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
): string {
  return workspace.columns
    .map((column) =>
      column.components
        .map((component) => {
          return component.frames
            .map((frame) => {
              const sessionId = previewSessionId(component, frame.name, viewportPreset)
              const cacheKey = studioPreviewCacheKey(component, frame.name, viewportPreset)
              const frameState = mergeStudioPreviewFrameState(
                sessionId,
                frameStates?.[sessionId],
                previewCache?.[cacheKey]?.frameState,
              )
              return `${component.coordinate}:${frame.name}:${studioPreviewLayoutSignature(frameState)}`
            })
            .join(";")
        })
        .join(","),
    )
    .join("|")
}

export function studioCanvasFramePreviewScale(
  _workspace: StudioWorkspaceState,
  _viewportPreset: StudioViewportPreset,
  _frameStates: Record<string, StudioPreviewFrameState> | undefined,
  _previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  _previewGeometryStore?: StudioPreviewGeometryCacheStore,
): number {
  return studioCanvasFixedFramePreviewScale
}

export function studioComponentCardLayout(input: {
  frameStatesByName: Record<string, StudioPreviewFrameState | undefined>
  framePreviewScale?: number
  component: StudioManifestComponent
  viewportPreset: StudioViewportPreset
}): StudioComponentCardLayout {
  const frameGridItems = studioComponentFrameGridItems(input.component, input.frameStatesByName, input.viewportPreset)
  const frameGridLayout = computeStudioFrameGridLayout({
    frameChromeHeight: studioComponentFrameChromeHeight,
    gap: studioComponentFrameGridGap,
    items: frameGridItems,
    maxSide: studioFrameGridMaxSide(input.viewportPreset, input.component.frames.length),
    minScale: studioComponentFrameGridMinScale,
    previewScale: input.framePreviewScale,
  })

  return {
    frameGridLayout,
    frameGridItems,
    height: studioComponentCardTitleHeight + studioComponentCardTitleGap + frameGridLayout.height,
    width: Math.max(280, frameGridLayout.width),
  }
}

export function studioWorkspaceColumnMeasurementsFromGeometry(input: {
  framePreviewScale?: number
  frameStates?: Record<string, StudioPreviewFrameState>
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
  workspace: StudioWorkspaceState
}): Record<number, StudioColumnLayoutMeasurement> {
  const framePreviewScale =
    input.framePreviewScale ??
    studioCanvasFramePreviewScale(
      input.workspace,
      input.viewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    )
  const measurements: Record<number, StudioColumnLayoutMeasurement> = {}

  input.workspace.columns.forEach((column, columnIndex) => {
    const cardRectsByCoordinate: Record<string, StudioCanvasScreenRect> = {}
    const previewFrameRectsBySessionId: Record<string, StudioCanvasScreenRect> = {}
    let cardTop = 0

    for (const component of column.components) {
      const frameStatesByName = studioComponentFrameLayoutFrameStates(
        component,
        input.viewportPreset,
        input.frameStates,
        input.previewCache,
        input.previewGeometryStore,
      )
      const cardLayout = studioComponentCardLayout({
        frameStatesByName,
        framePreviewScale,
        component,
        viewportPreset: input.viewportPreset,
      })
      cardRectsByCoordinate[component.coordinate] = {
        bottom: cardTop + cardLayout.height,
        left: 0,
        right: cardLayout.width,
        top: cardTop,
      }

      component.frames.forEach((frame, frameIndex) => {
        const frameGridItem = cardLayout.frameGridItems[frameIndex]
        if (!frameGridItem) return

        const columnIndex = frameIndex % cardLayout.frameGridLayout.columns
        const rowIndex = Math.floor(frameIndex / cardLayout.frameGridLayout.columns)
        const cellLeft = columnIndex * (cardLayout.frameGridLayout.cellWidth + cardLayout.frameGridLayout.gap)
        const cellTop = rowIndex * (cardLayout.frameGridLayout.cellHeight + cardLayout.frameGridLayout.gap)
        const frameWidth = Math.ceil(frameGridItem.width * cardLayout.frameGridLayout.previewScale)
        const frameHeight = Math.ceil(frameGridItem.height * cardLayout.frameGridLayout.previewScale)
        const frameLeft = cellLeft + (cardLayout.frameGridLayout.cellWidth - frameWidth) / 2
        const frameTop =
          studioComponentCardTitleHeight + studioComponentCardTitleGap + cellTop

        previewFrameRectsBySessionId[previewSessionId(component, frame.name, input.viewportPreset)] = {
          bottom: cardTop + frameTop + frameHeight,
          left: frameLeft,
          right: frameLeft + frameWidth,
          top: cardTop + frameTop,
        }
      })

      cardTop += cardLayout.height + studioComponentCardColumnGap
    }

    measurements[columnIndex] = {
      cardRectsByCoordinate,
      height: column.components.length > 0 ? cardTop - studioComponentCardColumnGap : 0,
      previewFrameRectsBySessionId,
    }
  })

  return measurements
}

export function studioCanvasCardIndex(input: {
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
  workspace: StudioWorkspaceState
}): StudioCanvasCardIndex {
  const byColumnIndex: Record<number, StudioCanvasCardIndexEntry[]> = {}
  const byPathKey: Record<string, StudioCanvasCardIndexEntry> = {}
  let complete = true

  input.workspace.columns.forEach((column, columnIndex) => {
    const cardRectsByCoordinate = input.columnMeasurementsByIndex[columnIndex]?.cardRectsByCoordinate ?? {}
    const entries = column.components
      .map((component) => {
        const pathKey = studioPathKey(studioComponentPathForColumn(input.workspace, columnIndex, component.coordinate))
        const entry: StudioCanvasCardIndexEntry = {
          columnIndex,
          component,
          pathKey,
          rect: cardRectsByCoordinate[component.coordinate],
        }
        if (!entry.rect) complete = false
        byPathKey[pathKey] = entry
        return entry
      })
      .sort((left, right) => (left.rect?.top ?? Number.POSITIVE_INFINITY) - (right.rect?.top ?? Number.POSITIVE_INFINITY))

    byColumnIndex[columnIndex] = entries
  })

  return { byColumnIndex, byPathKey, complete }
}

export function measuredStudioColumnLayoutPackedByComponentOrder(input: {
  componentCoordinates: string[]
  fallbackMeasurement: StudioColumnLayoutMeasurement
  measuredCardsByCoordinate: Record<string, MeasuredStudioColumnCardLayout | undefined>
  previewFrameSessionIdsByCoordinate: Record<string, string[]>
}): StudioColumnLayoutMeasurement {
  const cardRectsByCoordinate: Record<string, StudioCanvasScreenRect> = {}
  const previewFrameRectsBySessionId: Record<string, StudioCanvasScreenRect> = {}
  let cardTop = 0

  for (const coordinate of input.componentCoordinates) {
    const fallbackCardRect = input.fallbackMeasurement.cardRectsByCoordinate[coordinate]
    const measuredCard = input.measuredCardsByCoordinate[coordinate]
    const width = measuredCard ? stableMeasuredCanvasLength(measuredCard.width) : rectWidth(fallbackCardRect)
    const height = measuredCard ? stableMeasuredCanvasLength(measuredCard.height) : rectHeight(fallbackCardRect)
    if (width === undefined || height === undefined) continue

    const packedCardRect = {
      bottom: cardTop + height,
      left: 0,
      right: width,
      top: cardTop,
    }
    cardRectsByCoordinate[coordinate] = packedCardRect

    for (const sessionId of input.previewFrameSessionIdsByCoordinate[coordinate] ?? []) {
      const measuredPreviewFrameRect = measuredCard?.previewFrameRectsBySessionId?.[sessionId]
      if (measuredPreviewFrameRect) {
        previewFrameRectsBySessionId[sessionId] = translateRect(measuredPreviewFrameRect, packedCardRect.left, packedCardRect.top)
        continue
      }

      const fallbackPreviewFrameRect = input.fallbackMeasurement.previewFrameRectsBySessionId?.[sessionId]
      if (!fallbackPreviewFrameRect || !fallbackCardRect) continue
      previewFrameRectsBySessionId[sessionId] = translateRect(
        fallbackPreviewFrameRect,
        packedCardRect.left - fallbackCardRect.left,
        packedCardRect.top - fallbackCardRect.top,
      )
    }

    cardTop = packedCardRect.bottom + studioComponentCardColumnGap
  }

  return {
    cardRectsByCoordinate,
    height: input.componentCoordinates.length > 0 ? cardTop - studioComponentCardColumnGap : 0,
    previewFrameRectsBySessionId,
  }
}

export function visibleStudioCanvasCardEntriesByColumnIndex(input: {
  canvas: StudioCanvasTransform
  cardIndex: StudioCanvasCardIndex
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  renderBufferMargin: number
  selectedCardPathKey?: string
  viewportSize: { height: number; width: number }
}): Record<number, StudioCanvasCardIndexEntry[]> {
  const visibleByColumnIndex: Record<number, StudioCanvasCardIndexEntry[]> = {}
  const buffer = studioCanvasCardShellViewportBuffer(input.renderBufferMargin, input.canvas.scale)
  const viewportRect = studioCanvasViewportRect(input.canvas, input.viewportSize, buffer)

  for (const [rawColumnIndex, entries] of Object.entries(input.cardIndex.byColumnIndex)) {
    const columnIndex = Number(rawColumnIndex)
    const columnLayout = input.columnLayoutByIndex[columnIndex] ?? { x: 0, y: 0 }
    const localViewportRect = translateStudioCanvasRect(viewportRect, -columnLayout.x, -columnLayout.y)
    const selectedEntries: StudioCanvasCardIndexEntry[] = []

    if (input.cardIndex.complete) {
      const startIndex = firstStudioCanvasCardIndexWithBottomAtLeast(entries, localViewportRect.top)
      for (let index = startIndex; index < entries.length; index += 1) {
        const entry = entries[index]
        if (!entry?.rect) continue
        if (entry.rect.top > localViewportRect.bottom) break
        if (rectsIntersect(entry.rect, localViewportRect)) selectedEntries.push(entry)
      }
    } else {
      for (const entry of entries) {
        if (!entry.rect || rectsIntersect(entry.rect, localViewportRect)) selectedEntries.push(entry)
      }
    }

    if (selectedEntries.length > 0) visibleByColumnIndex[columnIndex] = selectedEntries
  }

  if (input.selectedCardPathKey) {
    const selectedEntry = input.cardIndex.byPathKey[input.selectedCardPathKey]
    if (selectedEntry) {
      const selectedEntries = visibleByColumnIndex[selectedEntry.columnIndex] ?? []
      if (!selectedEntries.some((entry) => entry.pathKey === selectedEntry.pathKey)) {
        visibleByColumnIndex[selectedEntry.columnIndex] = [...selectedEntries, selectedEntry]
      }
    }
  }

  return visibleByColumnIndex
}

export function studioPreviewVisibilityItems(
  workspace: StudioWorkspaceState,
  viewportPreset: StudioViewportPreset,
  columnLayoutByIndex: Record<number, StudioColumnLayout>,
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>,
  options: {
    canvas?: StudioCanvasTransform
    framePreviewScale?: number
    cardIndex?: StudioCanvasCardIndex
    frameStates?: Record<string, StudioPreviewFrameState>
    previewCache?: Record<string, StudioPreviewCacheEntry>
    previewGeometryStore?: StudioPreviewGeometryCacheStore
    renderBufferMargin?: number
    viewport?: StudioViewportRect
  } = {},
): StudioCanvasPreviewVisibilityItem[] {
  const items: StudioCanvasPreviewVisibilityItem[] = []
  let fallbackFramePreviewScale: number | undefined
  const renderBufferMargin = options.renderBufferMargin ?? studioPreviewRenderBufferMargin
  const viewportFilter =
    options.canvas && options.viewport
      ? studioCanvasViewportRect(
          options.canvas,
          {
            height: options.viewport.bottom - options.viewport.top,
            width: options.viewport.right - options.viewport.left,
          },
          studioCanvasCardShellViewportBuffer(renderBufferMargin, options.canvas.scale),
        )
      : undefined
  const visibleCardEntriesByColumnIndex =
    options.cardIndex && options.canvas && options.viewport
      ? visibleStudioCanvasCardEntriesByColumnIndex({
          canvas: options.canvas,
          cardIndex: options.cardIndex,
          columnLayoutByIndex,
          renderBufferMargin,
          viewportSize: {
            height: options.viewport.bottom - options.viewport.top,
            width: options.viewport.right - options.viewport.left,
          },
        })
      : undefined
  const columnEntries = visibleCardEntriesByColumnIndex
    ? Object.entries(visibleCardEntriesByColumnIndex)
    : workspace.columns.map((column, columnIndex) => [
        String(columnIndex),
        column.components.map((component) => ({
          columnIndex,
          component,
          pathKey: studioPathKey(studioComponentPathForColumn(workspace, columnIndex, component.coordinate)),
          rect: columnMeasurementsByIndex[columnIndex]?.cardRectsByCoordinate[component.coordinate],
        } satisfies StudioCanvasCardIndexEntry)),
      ] as const)

  columnEntries.forEach(([rawColumnIndex, entries]) => {
    const columnIndex = Number(rawColumnIndex)
    const columnLayout = columnLayoutByIndex[columnIndex] ?? { x: 0, y: 0 }
    const cardRectsByCoordinate = columnMeasurementsByIndex[columnIndex]?.cardRectsByCoordinate ?? {}
    const previewFrameRectsBySessionId = columnMeasurementsByIndex[columnIndex]?.previewFrameRectsBySessionId ?? {}

    for (const entry of entries) {
      const component = entry.component
      const cardRect = entry.rect ?? cardRectsByCoordinate[component.coordinate]
      if (!cardRect) continue
      const absoluteCardRect = translateStudioCanvasRect(cardRect, columnLayout.x, columnLayout.y)
      if (!visibleCardEntriesByColumnIndex && viewportFilter && !rectsIntersect(absoluteCardRect, viewportFilter)) continue

      const measuredSessionIds = new Set<string>()
      for (const frame of component.frames) {
        const sessionId = previewSessionId(component, frame.name, viewportPreset)
        const previewFrameRect = previewFrameRectsBySessionId[sessionId]
        if (!previewFrameRect) continue

        measuredSessionIds.add(sessionId)
        items.push({
          rect: {
            bottom: columnLayout.y + previewFrameRect.bottom,
            left: columnLayout.x + previewFrameRect.left,
            right: columnLayout.x + previewFrameRect.right,
            top: columnLayout.y + previewFrameRect.top,
          },
          sessionIds: [sessionId],
        })
      }

      if (measuredSessionIds.size === component.frames.length) continue
      fallbackFramePreviewScale ??=
        options.framePreviewScale ??
        studioCanvasFramePreviewScale(
          workspace,
          viewportPreset,
          options.frameStates,
          options.previewCache,
          options.previewGeometryStore,
        )
      items.push(
        ...studioComponentFallbackFramePreviewVisibilityItems({
          cardRect,
          framePreviewScale: fallbackFramePreviewScale,
          columnLayout,
          component,
          measuredSessionIds,
          previewCache: options.previewCache,
          previewGeometryStore: options.previewGeometryStore,
          frameStates: options.frameStates,
          viewportPreset,
        }),
      )
    }
  })

  return items
}

function studioCanvasViewportRect(
  canvas: StudioCanvasTransform,
  viewportSize: { height: number; width: number },
  buffer: number,
): StudioViewportRect {
  const scale = Math.max(0.01, canvas.scale)
  return {
    bottom: (viewportSize.height - canvas.y) / scale + buffer,
    left: -canvas.x / scale - buffer,
    right: (viewportSize.width - canvas.x) / scale + buffer,
    top: -canvas.y / scale - buffer,
  }
}

function studioCanvasCardShellViewportBuffer(renderBufferMargin: number, canvasScale: number): number {
  const scale = Math.max(0.01, canvasScale)
  return Math.max(renderBufferMargin, studioCanvasCardShellViewportStabilityMargin) / scale
}

function translateStudioCanvasRect(rect: StudioCanvasScreenRect, x: number, y: number): StudioViewportRect {
  return {
    bottom: rect.bottom + y,
    left: rect.left + x,
    right: rect.right + x,
    top: rect.top + y,
  }
}

function firstStudioCanvasCardIndexWithBottomAtLeast(entries: readonly StudioCanvasCardIndexEntry[], value: number): number {
  let low = 0
  let high = entries.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const bottom = entries[middle]?.rect?.bottom ?? Number.POSITIVE_INFINITY
    if (bottom < value) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

export function sameColumnLayoutRecord(left: Record<number, StudioColumnLayout>, right: Record<number, StudioColumnLayout>): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    const leftLayout = left[Number(key)]
    const rightLayout = right[Number(key)]
    return leftLayout?.x === rightLayout?.x && leftLayout?.y === rightLayout?.y
  })
}

export function sameColumnMeasurementRecord(
  left: Record<number, StudioColumnLayoutMeasurement>,
  right: Record<number, StudioColumnLayoutMeasurement>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    const columnIndex = Number(key)
    const leftMeasurement = left[columnIndex]
    const rightMeasurement = right[columnIndex]
    if (!leftMeasurement || !rightMeasurement || leftMeasurement.height !== rightMeasurement.height) return false
    return (
      sameCardRectRecord(leftMeasurement.cardRectsByCoordinate, rightMeasurement.cardRectsByCoordinate) &&
      sameCardRectRecord(leftMeasurement.previewFrameRectsBySessionId ?? {}, rightMeasurement.previewFrameRectsBySessionId ?? {})
    )
  })
}

function studioComponentFrameGridItems(
  component: StudioManifestComponent,
  frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
  viewportPreset: StudioViewportPreset,
): StudioFrameGridItemLayout[] {
  return component.frames.map((frame) => {
    const frameState = frameStatesByName[frame.name]
    const displaySize = studioPreviewFrameSize(viewportPreset, frameState?.size)
    const boundaryRect = studioBoundaryRectForComponent(frameState?.tree, component.coordinate)
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)

    return {
      height: previewFrameLayoutHeight(displaySize, visibleBoundaryRect),
      width: Number(previewFrameLayoutWidth(displaySize, visibleBoundaryRect)),
    }
  })
}

function studioComponentFallbackFramePreviewVisibilityItems(input: {
  cardRect: StudioCanvasScreenRect
  framePreviewScale: number
  columnLayout: StudioColumnLayout
  component: StudioManifestComponent
  frameStates?: Record<string, StudioPreviewFrameState>
  measuredSessionIds: ReadonlySet<string>
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
}): StudioCanvasPreviewVisibilityItem[] {
  const frameStatesByName = studioComponentFrameLayoutFrameStates(
    input.component,
    input.viewportPreset,
    input.frameStates,
    input.previewCache,
    input.previewGeometryStore,
  )
  const frameGridItems = studioComponentFrameGridItems(input.component, frameStatesByName, input.viewportPreset)
  const frameGridLayout = computeStudioFrameGridLayout({
    frameChromeHeight: studioComponentFrameChromeHeight,
    gap: studioComponentFrameGridGap,
    items: frameGridItems,
    maxSide: studioFrameGridMaxSide(input.viewportPreset, input.component.frames.length),
    minScale: studioComponentFrameGridMinScale,
    previewScale: input.framePreviewScale,
  })
  const gridLeft = input.cardRect.left
  const gridTop = input.cardRect.bottom - frameGridLayout.height
  const items: StudioCanvasPreviewVisibilityItem[] = []

  input.component.frames.forEach((frame, frameIndex) => {
    const sessionId = previewSessionId(input.component, frame.name, input.viewportPreset)
    if (input.measuredSessionIds.has(sessionId)) return

    const gridItem = frameGridItems[frameIndex]
    if (!gridItem) return

    const column = frameIndex % frameGridLayout.columns
    const row = Math.floor(frameIndex / frameGridLayout.columns)
    const cellLeft = gridLeft + column * (frameGridLayout.cellWidth + frameGridLayout.gap)
    const cellTop = gridTop + row * (frameGridLayout.cellHeight + frameGridLayout.gap)
    const frameWidth = Math.ceil(gridItem.width * frameGridLayout.previewScale)
    const frameHeight = Math.ceil(gridItem.height * frameGridLayout.previewScale)
    const frameLeft = cellLeft + (frameGridLayout.cellWidth - frameWidth) / 2
    const frameTop = cellTop

    items.push({
      rect: {
        bottom: input.columnLayout.y + frameTop + frameHeight,
        left: input.columnLayout.x + frameLeft,
        right: input.columnLayout.x + frameLeft + frameWidth,
        top: input.columnLayout.y + frameTop,
      },
      sessionIds: [sessionId],
    })
  })

  return items
}

function studioBoundaryRectForComponent(tree: StudioPreviewFrameState["tree"], coordinate: string): GBoundaryRect | undefined {
  return studioBoundaryRectForCoordinate(tree, coordinate)
}

function studioPreviewLayoutSignature(frameState: StudioPreviewFrameState | undefined): string {
  if (!frameState) return "pending"
  const size = frameState.size ? `${frameState.size.width}x${frameState.size.height}` : "-"
  return `${size}:${boundaryTreeLayoutSignature(frameState.tree)}`
}

function boundaryTreeLayoutSignature(tree: StudioPreviewFrameState["tree"]): string {
  if (!tree) return "-"
  const parts: string[] = []
  const visit = (node: NonNullable<StudioPreviewFrameState["tree"]>[number]) => {
    const rect = node.rect ? `${node.rect.x},${node.rect.y},${node.rect.width},${node.rect.height}` : "-"
    parts.push(`${node.coordinate}@${rect}`)
    for (const child of node.children) visit(child)
  }
  for (const node of tree) visit(node)
  return parts.join(";")
}

function sameCardRectRecord(
  left: Record<string, StudioCanvasScreenRect>,
  right: Record<string, StudioCanvasScreenRect>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => sameRect(left[key], right[key]))
}

function sameRect(left: StudioViewportRect | undefined, right: StudioViewportRect | undefined): boolean {
  return left?.bottom === right?.bottom && left?.left === right?.left && left?.right === right?.right && left?.top === right?.top
}

function rectsIntersect(
  left: { bottom: number; left: number; right: number; top: number },
  right: { bottom: number; left: number; right: number; top: number },
): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
}

function rectHeight(rect: StudioCanvasScreenRect | undefined): number | undefined {
  return rect ? rect.bottom - rect.top : undefined
}

function rectWidth(rect: StudioCanvasScreenRect | undefined): number | undefined {
  return rect ? rect.right - rect.left : undefined
}

function stableMeasuredCanvasLength(value: number): number {
  return Math.round(value * studioMeasuredCanvasLengthPrecision) / studioMeasuredCanvasLengthPrecision
}

function translateRect(rect: StudioCanvasScreenRect, x: number, y: number): StudioCanvasScreenRect {
  return {
    bottom: rect.bottom + y,
    left: rect.left + x,
    right: rect.right + x,
    top: rect.top + y,
  }
}
