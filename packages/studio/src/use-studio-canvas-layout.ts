"use client"

import React from "react"

import {
  computeStudioColumnLayout,
  previewSessionId,
  type StudioCanvasScreenRect,
  type StudioCanvasTransform,
  type StudioColumnLayout,
  type StudioColumnLayoutMeasurement,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "./client"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"
import {
  columnCardElementKey,
  domRectToLocalStudioCanvasScreenRect,
  measuredStudioColumnLayoutPackedByComponentOrder,
  sameColumnLayoutRecord,
  sameColumnMeasurementRecord,
  studioCanvasFramePreviewScale,
  studioWorkspaceColumnMeasurementsFromGeometry,
  studioWorkspaceLayoutMeasurementKey,
} from "./studio-canvas-geometry"

type MutableRef<T> = {
  current: T
}

type MountedStudioColumnCardElement = {
  coordinate: string
  element: HTMLDivElement
}

export type StudioCanvasLayout = {
  framePreviewScale: number
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  columnLayoutByIndexRef: MutableRef<Record<number, StudioColumnLayout>>
  columnMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement>
  columnMeasurementsByIndexRef: MutableRef<Record<number, StudioColumnLayoutMeasurement>>
  getCardElement: (columnIndex: number, coordinate: string) => HTMLDivElement | undefined
  layoutMeasurementKey: string | undefined
  scheduleMeasurement: () => void
  setCardElement: (columnIndex: number, coordinate: string, element: HTMLDivElement | null) => void
  setColumnElement: (columnIndex: number, element: HTMLElement | null) => void
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const studioColumnGap = 40

export function useStudioCanvasLayout(input: {
  canvasRef: MutableRef<StudioCanvasTransform>
  canvasSurfaceElement: HTMLDivElement | null
  canvasViewportPreset: StudioViewportPreset
  frameStates?: Record<string, StudioPreviewFrameState>
  onLayoutMeasured: () => void
  previewCache?: Record<string, StudioPreviewCacheEntry>
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  workspace: StudioWorkspaceState
}): StudioCanvasLayout {
  const [framePreviewScale, setFramePreviewScale] = React.useState(() =>
    studioCanvasFramePreviewScale(
      input.workspace,
      input.canvasViewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    ),
  )
  const fallbackColumnMeasurementsByIndex = React.useMemo(
    () =>
      studioWorkspaceColumnMeasurementsFromGeometry({
        framePreviewScale,
        frameStates: input.frameStates,
        previewCache: input.previewCache,
        previewGeometryStore: input.previewGeometryStore,
        viewportPreset: input.canvasViewportPreset,
        workspace: input.workspace,
      }),
    [
      framePreviewScale,
      input.canvasViewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
      input.workspace,
    ],
  )
  const fallbackColumnLayoutByIndex = React.useMemo(
    () => computeColumnLayout(input.workspace, fallbackColumnMeasurementsByIndex),
    [fallbackColumnMeasurementsByIndex, input.workspace],
  )
  const [columnLayoutByIndex, setColumnLayoutByIndex] =
    React.useState<Record<number, StudioColumnLayout>>(fallbackColumnLayoutByIndex)
  const [columnMeasurementsByIndex, setColumnMeasurementsByIndex] =
    React.useState<Record<number, StudioColumnLayoutMeasurement>>(fallbackColumnMeasurementsByIndex)
  const cardElements = React.useRef(new Map<string, HTMLDivElement>())
  const columnCardElements = React.useRef(new Map<string, HTMLDivElement>())
  const columnElements = React.useRef(new Map<number, HTMLElement>())
  const columnLayoutByIndexRef = React.useRef(columnLayoutByIndex)
  const columnMeasurementsByIndexRef = React.useRef(columnMeasurementsByIndex)
  const layoutFrame = React.useRef(0)
  const onLayoutMeasuredRef = React.useRef(input.onLayoutMeasured)

  const layoutMeasurementKey = React.useMemo(
    () =>
      input.previewGeometryStore
        ? undefined
        : studioWorkspaceLayoutMeasurementKey(
            input.workspace,
            input.canvasViewportPreset,
            input.frameStates,
            input.previewCache,
          ),
    [input.canvasViewportPreset, input.frameStates, input.previewCache, input.previewGeometryStore, input.workspace],
  )

  onLayoutMeasuredRef.current = input.onLayoutMeasured

  const setCardElement = React.useCallback((columnIndex: number, coordinate: string, element: HTMLDivElement | null) => {
    const key = columnCardElementKey(columnIndex, coordinate)
    if (element) {
      cardElements.current.set(coordinate, element)
      columnCardElements.current.set(key, element)
    } else {
      if (cardElements.current.get(coordinate) === columnCardElements.current.get(key)) cardElements.current.delete(coordinate)
      columnCardElements.current.delete(key)
    }
  }, [])

  const setColumnElement = React.useCallback((columnIndex: number, element: HTMLElement | null) => {
    if (element) {
      columnElements.current.set(columnIndex, element)
    } else {
      columnElements.current.delete(columnIndex)
    }
  }, [])

  const getCardElement = React.useCallback(
    (columnIndex: number, coordinate: string) =>
      columnCardElements.current.get(columnCardElementKey(columnIndex, coordinate)) ?? cardElements.current.get(coordinate),
    [],
  )

  const recomputeFramePreviewScale = React.useCallback(() => {
    const nextScale = studioCanvasFramePreviewScale(
      input.workspace,
      input.canvasViewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    )
    setFramePreviewScale((current) => (current === nextScale ? current : nextScale))
  }, [input.canvasViewportPreset, input.frameStates, input.previewCache, input.previewGeometryStore, input.workspace])

  const measure = React.useCallback(() => {
    const nextMeasurementsByIndex = cloneColumnMeasurements(fallbackColumnMeasurementsByIndex)
    const mountedCardElementsByColumnIndex = mountedStudioColumnCardElementsByColumnIndex(columnCardElements.current)

    input.workspace.columns.forEach((column, columnIndex) => {
      const columnElement = columnElements.current.get(columnIndex)
      if (!columnElement) return
      const mountedCardElements = mountedCardElementsByColumnIndex.get(columnIndex)
      if (!mountedCardElements?.length) return

      const measuredCardsByCoordinate: Record<string, { height: number; width: number; previewFrameRectsBySessionId: Record<string, StudioCanvasScreenRect> }> = {}
      const scale = input.canvasRef.current.scale
      for (const { coordinate, element: cardElement } of mountedCardElements) {
        const cardRect = cardElement.getBoundingClientRect()
        const previewFrameRectsBySessionId: Record<string, StudioCanvasScreenRect> = {}
        for (const previewFrame of cardElement.querySelectorAll<HTMLElement>("[data-runelight-preview-session-id]")) {
          const sessionId = previewFrame.dataset.runelightPreviewSessionId
          if (!sessionId) continue
          previewFrameRectsBySessionId[sessionId] = domRectToLocalStudioCanvasScreenRect(
            previewFrame.getBoundingClientRect(),
            cardRect,
            scale,
          )
        }
        measuredCardsByCoordinate[coordinate] = {
          height: cardRect.height / scale,
          previewFrameRectsBySessionId,
          width: cardRect.width / scale,
        }
      }
      const fallbackMeasurement = nextMeasurementsByIndex[columnIndex]
      if (!fallbackMeasurement) return
      nextMeasurementsByIndex[columnIndex] = measuredStudioColumnLayoutPackedByComponentOrder({
        componentCoordinates: column.components.map((component) => component.coordinate),
        fallbackMeasurement,
        measuredCardsByCoordinate,
        previewFrameSessionIdsByCoordinate: Object.fromEntries(
          column.components.map((component) => [
            component.coordinate,
            component.frames.map((frame) => previewSessionId(component, frame.name, input.canvasViewportPreset)),
          ]),
        ),
      })
    })

    const nextLayoutByIndex = computeColumnLayout(input.workspace, nextMeasurementsByIndex)

    const measurementsChanged = !sameColumnMeasurementRecord(columnMeasurementsByIndexRef.current, nextMeasurementsByIndex)
    const layoutChanged = !sameColumnLayoutRecord(columnLayoutByIndexRef.current, nextLayoutByIndex)

    columnMeasurementsByIndexRef.current = nextMeasurementsByIndex
    columnLayoutByIndexRef.current = nextLayoutByIndex
    setColumnMeasurementsByIndex((current) =>
      sameColumnMeasurementRecord(current, nextMeasurementsByIndex) ? current : nextMeasurementsByIndex,
    )
    setColumnLayoutByIndex((current) => (sameColumnLayoutRecord(current, nextLayoutByIndex) ? current : nextLayoutByIndex))
    if (measurementsChanged || layoutChanged) onLayoutMeasuredRef.current()
  }, [fallbackColumnMeasurementsByIndex, input.canvasRef, input.workspace])

  const scheduleMeasurement = React.useCallback(() => {
    recomputeFramePreviewScale()
    if (typeof window === "undefined") {
      measure()
      return
    }
    if (layoutFrame.current) return
    layoutFrame.current = window.requestAnimationFrame(() => {
      layoutFrame.current = 0
      measure()
    })
  }, [measure, recomputeFramePreviewScale])

  useStudioLayoutEffect(() => {
    recomputeFramePreviewScale()
    measure()
  }, [input.canvasSurfaceElement, layoutMeasurementKey, measure, recomputeFramePreviewScale])

  React.useEffect(() => {
    return () => {
      if (layoutFrame.current) window.cancelAnimationFrame(layoutFrame.current)
    }
  }, [])

  return {
    framePreviewScale,
    columnLayoutByIndex,
    columnLayoutByIndexRef,
    columnMeasurementsByIndex,
    columnMeasurementsByIndexRef,
    getCardElement,
    layoutMeasurementKey,
    scheduleMeasurement,
    setCardElement,
    setColumnElement,
  }
}

function computeColumnLayout(
  workspace: StudioWorkspaceState,
  measurementsByIndex: Record<number, StudioColumnLayoutMeasurement>,
): Record<number, StudioColumnLayout> {
  return computeStudioColumnLayout({
    columns: workspace.columns.map((column) => ({
      componentCoordinates: column.components.map((component) => component.coordinate),
      parentCoordinate: column.parentCoordinate,
    })),
    margin: studioColumnGap,
    measurementsByIndex,
  })
}

function cloneColumnMeasurements(
  measurementsByIndex: Record<number, StudioColumnLayoutMeasurement>,
): Record<number, StudioColumnLayoutMeasurement> {
  return Object.fromEntries(
    Object.entries(measurementsByIndex).map(([index, measurement]) => [
      index,
      {
        cardRectsByCoordinate: { ...measurement.cardRectsByCoordinate },
        height: measurement.height,
        previewFrameRectsBySessionId: { ...(measurement.previewFrameRectsBySessionId ?? {}) },
      },
    ]),
  )
}

function mountedStudioColumnCardElementsByColumnIndex(
  columnCardElements: ReadonlyMap<string, HTMLDivElement>,
): Map<number, MountedStudioColumnCardElement[]> {
  const elementsByColumnIndex = new Map<number, MountedStudioColumnCardElement[]>()

  for (const [key, element] of columnCardElements) {
    const parsed = parseColumnCardElementKey(key)
    if (!parsed) continue
    const elements = elementsByColumnIndex.get(parsed.columnIndex) ?? []
    elements.push({ coordinate: parsed.coordinate, element })
    elementsByColumnIndex.set(parsed.columnIndex, elements)
  }

  return elementsByColumnIndex
}

function parseColumnCardElementKey(key: string): { columnIndex: number; coordinate: string } | undefined {
  const separatorIndex = key.indexOf("\n")
  if (separatorIndex < 0) return undefined

  const columnIndex = Number(key.slice(0, separatorIndex))
  if (!Number.isInteger(columnIndex) || columnIndex < 0) return undefined

  return {
    columnIndex,
    coordinate: key.slice(separatorIndex + 1),
  }
}
