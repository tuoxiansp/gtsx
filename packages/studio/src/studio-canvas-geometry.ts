"use client"

import type { GBoundaryRect, GBoundaryTreeNode } from "@gtsx/core"

import {
  clipPreviewBoundaryRectToViewport,
  computeStudioCaseGridLayout,
  mergeStudioPreviewFrameState,
  previewSessionId,
  studioPreviewCacheKey,
  studioPreviewFrameSize,
  visibleWorkspaceComponents,
  type StudioCanvasScreenRect,
  type StudioCanvasTransform,
  type StudioCaseGridItemLayout,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "./client"
import {
  studioCaseGridMaxSide,
  studioComponentCaseChromeHeight,
  studioComponentCaseGridGap,
  studioComponentCaseGridMinScale,
} from "./case-grid-layout"
import { previewFrameLayoutHeight, previewFrameLayoutWidth } from "./preview-frame-layout"
import { type StudioCanvasPreviewVisibilityItem, type StudioViewportRect } from "./preview-lazy-loading"
import type { StudioManifestComponent } from "./manifest"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"
import { studioComponentCaseLayoutFrameStates } from "./studio-component-preview-frame-states"

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
    bottom: (rect.bottom - originRect.top) / scale,
    left: (rect.left - originRect.left) / scale,
    right: (rect.right - originRect.left) / scale,
    top: (rect.top - originRect.top) / scale,
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
          return component.cases
            .map((testCase) => {
              const sessionId = previewSessionId(component, testCase.name, viewportPreset)
              const cacheKey = studioPreviewCacheKey(component, testCase.name, viewportPreset)
              const frameState = mergeStudioPreviewFrameState(
                sessionId,
                frameStates?.[sessionId],
                previewCache?.[cacheKey]?.frameState,
              )
              return `${component.coordinate}:${testCase.name}:${studioPreviewLayoutSignature(frameState)}`
            })
            .join(";")
        })
        .join(","),
    )
    .join("|")
}

export function studioCanvasCasePreviewScale(
  workspace: StudioWorkspaceState,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  previewGeometryStore?: StudioPreviewGeometryCacheStore,
): number {
  const scales = visibleWorkspaceComponents(workspace).map((component) => {
    const caseFrameStates = studioComponentCaseLayoutFrameStates(
      component,
      viewportPreset,
      frameStates,
      previewCache,
      previewGeometryStore,
    )
    return computeStudioCaseGridLayout({
      caseChromeHeight: studioComponentCaseChromeHeight,
      gap: studioComponentCaseGridGap,
      items: studioComponentCaseGridItems(component, caseFrameStates, viewportPreset),
      maxSide: studioCaseGridMaxSide(viewportPreset, component.cases.length),
      minScale: studioComponentCaseGridMinScale,
    }).previewScale
  })

  return scales.length > 0 ? Math.min(1, ...scales) : 1
}

export function studioPreviewVisibilityItems(
  workspace: StudioWorkspaceState,
  viewportPreset: StudioViewportPreset,
  columnLayoutByIndex: Record<number, StudioColumnLayout>,
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>,
  options: {
    frameStates?: Record<string, StudioPreviewFrameState>
    previewCache?: Record<string, StudioPreviewCacheEntry>
    previewGeometryStore?: StudioPreviewGeometryCacheStore
  } = {},
): StudioCanvasPreviewVisibilityItem[] {
  const items: StudioCanvasPreviewVisibilityItem[] = []
  let fallbackCasePreviewScale: number | undefined

  workspace.columns.forEach((column, columnIndex) => {
    const columnLayout = columnLayoutByIndex[columnIndex] ?? { x: 0, y: 0 }
    const cardRectsByCoordinate = columnMeasurementsByIndex[columnIndex]?.cardRectsByCoordinate ?? {}
    const previewFrameRectsBySessionId = columnMeasurementsByIndex[columnIndex]?.previewFrameRectsBySessionId ?? {}

    for (const component of column.components) {
      const cardRect = cardRectsByCoordinate[component.coordinate]
      if (!cardRect) continue

      const measuredSessionIds = new Set<string>()
      for (const testCase of component.cases) {
        const sessionId = previewSessionId(component, testCase.name, viewportPreset)
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

      if (measuredSessionIds.size === component.cases.length) continue
      fallbackCasePreviewScale ??= studioCanvasCasePreviewScale(
        workspace,
        viewportPreset,
        options.frameStates,
        options.previewCache,
        options.previewGeometryStore,
      )
      items.push(
        ...studioComponentFallbackCasePreviewVisibilityItems({
          cardRect,
          casePreviewScale: fallbackCasePreviewScale,
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

function studioComponentCaseGridItems(
  component: StudioManifestComponent,
  caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
  viewportPreset: StudioViewportPreset,
): StudioCaseGridItemLayout[] {
  return component.cases.map((testCase) => {
    const frameState = caseFrameStates[testCase.name]
    const displaySize = studioPreviewFrameSize(viewportPreset, frameState?.size)
    const boundaryRect = studioBoundaryRectForComponent(frameState?.tree, component.coordinate)
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)

    return {
      height: previewFrameLayoutHeight(displaySize, visibleBoundaryRect),
      width: Number(previewFrameLayoutWidth(displaySize, visibleBoundaryRect)),
    }
  })
}

function studioComponentFallbackCasePreviewVisibilityItems(input: {
  cardRect: StudioCanvasScreenRect
  casePreviewScale: number
  columnLayout: StudioColumnLayout
  component: StudioManifestComponent
  frameStates?: Record<string, StudioPreviewFrameState>
  measuredSessionIds: ReadonlySet<string>
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
}): StudioCanvasPreviewVisibilityItem[] {
  const caseFrameStates = studioComponentCaseLayoutFrameStates(
    input.component,
    input.viewportPreset,
    input.frameStates,
    input.previewCache,
    input.previewGeometryStore,
  )
  const caseGridItems = studioComponentCaseGridItems(input.component, caseFrameStates, input.viewportPreset)
  const caseGridLayout = computeStudioCaseGridLayout({
    caseChromeHeight: studioComponentCaseChromeHeight,
    gap: studioComponentCaseGridGap,
    items: caseGridItems,
    maxSide: studioCaseGridMaxSide(input.viewportPreset, input.component.cases.length),
    minScale: studioComponentCaseGridMinScale,
    previewScale: input.casePreviewScale,
  })
  const gridLeft = input.cardRect.left
  const gridTop = input.cardRect.bottom - caseGridLayout.height
  const items: StudioCanvasPreviewVisibilityItem[] = []

  input.component.cases.forEach((testCase, caseIndex) => {
    const sessionId = previewSessionId(input.component, testCase.name, input.viewportPreset)
    if (input.measuredSessionIds.has(sessionId)) return

    const gridItem = caseGridItems[caseIndex]
    if (!gridItem) return

    const column = caseIndex % caseGridLayout.columns
    const row = Math.floor(caseIndex / caseGridLayout.columns)
    const cellLeft = gridLeft + column * (caseGridLayout.cellWidth + caseGridLayout.gap)
    const cellTop = gridTop + row * (caseGridLayout.cellHeight + caseGridLayout.gap)
    const frameWidth = Math.ceil(gridItem.width * caseGridLayout.previewScale)
    const frameHeight = Math.ceil(gridItem.height * caseGridLayout.previewScale)
    const frameLeft = cellLeft + (caseGridLayout.cellWidth - frameWidth) / 2
    const frameTop = cellTop + studioComponentCaseChromeHeight

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

function studioBoundaryRectForComponent(tree: GBoundaryTreeNode[] | undefined, coordinate: string): GBoundaryRect | undefined {
  return tree ? findStudioBoundaryNode(tree, coordinate)?.rect : undefined
}

function findStudioBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findStudioBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
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
