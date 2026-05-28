"use client"

import React from "react"

import {
  computeStudioColumnLayout,
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
  sameColumnLayoutRecord,
  sameColumnMeasurementRecord,
  studioCanvasCasePreviewScale,
  studioWorkspaceLayoutMeasurementKey,
} from "./studio-canvas-geometry"

type MutableRef<T> = {
  current: T
}

export type StudioCanvasLayout = {
  casePreviewScale: number
  columnLayoutByIndex: Record<number, StudioColumnLayout>
  columnLayoutByIndexRef: MutableRef<Record<number, StudioColumnLayout>>
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
  const [columnLayoutByIndex, setColumnLayoutByIndex] = React.useState<Record<number, StudioColumnLayout>>({})
  const [columnMeasurementsByIndex, setColumnMeasurementsByIndex] = React.useState<Record<number, StudioColumnLayoutMeasurement>>({})
  const [casePreviewScale, setCasePreviewScale] = React.useState(() =>
    studioCanvasCasePreviewScale(
      input.workspace,
      input.canvasViewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    ),
  )
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

  const recomputeCasePreviewScale = React.useCallback(() => {
    const nextScale = studioCanvasCasePreviewScale(
      input.workspace,
      input.canvasViewportPreset,
      input.frameStates,
      input.previewCache,
      input.previewGeometryStore,
    )
    setCasePreviewScale((current) => (current === nextScale ? current : nextScale))
  }, [input.canvasViewportPreset, input.frameStates, input.previewCache, input.previewGeometryStore, input.workspace])

  const measure = React.useCallback(() => {
    if (!input.canvasSurfaceElement) return

    const nextMeasurementsByIndex: Record<number, StudioColumnLayoutMeasurement> = {}

    input.workspace.columns.forEach((column, columnIndex) => {
      const columnElement = columnElements.current.get(columnIndex)
      if (!columnElement) return

      const columnRect = columnElement.getBoundingClientRect()
      const cardRectsByCoordinate: Record<string, StudioCanvasScreenRect> = {}
      const previewFrameRectsBySessionId: Record<string, StudioCanvasScreenRect> = {}
      for (const component of column.components) {
        const cardElement = columnCardElements.current.get(columnCardElementKey(columnIndex, component.coordinate))
        if (!cardElement) continue
        cardRectsByCoordinate[component.coordinate] = domRectToLocalStudioCanvasScreenRect(
          cardElement.getBoundingClientRect(),
          columnRect,
          input.canvasRef.current.scale,
        )
        for (const previewFrame of cardElement.querySelectorAll<HTMLElement>("[data-gtsx-preview-session-id]")) {
          const sessionId = previewFrame.dataset.gtsxPreviewSessionId
          if (!sessionId) continue
          previewFrameRectsBySessionId[sessionId] = domRectToLocalStudioCanvasScreenRect(
            previewFrame.getBoundingClientRect(),
            columnRect,
            input.canvasRef.current.scale,
          )
        }
      }
      nextMeasurementsByIndex[columnIndex] = {
        cardRectsByCoordinate,
        height: columnRect.height / input.canvasRef.current.scale,
        previewFrameRectsBySessionId,
      }
    })

    const nextLayoutByIndex = computeStudioColumnLayout({
      columns: input.workspace.columns.map((column) => ({
        componentCoordinates: column.components.map((component) => component.coordinate),
        parentCoordinate: column.parentCoordinate,
      })),
      margin: studioColumnGap,
      measurementsByIndex: nextMeasurementsByIndex,
    })

    const measurementsChanged = !sameColumnMeasurementRecord(columnMeasurementsByIndexRef.current, nextMeasurementsByIndex)
    const layoutChanged = !sameColumnLayoutRecord(columnLayoutByIndexRef.current, nextLayoutByIndex)

    columnMeasurementsByIndexRef.current = nextMeasurementsByIndex
    columnLayoutByIndexRef.current = nextLayoutByIndex
    setColumnMeasurementsByIndex((current) =>
      sameColumnMeasurementRecord(current, nextMeasurementsByIndex) ? current : nextMeasurementsByIndex,
    )
    setColumnLayoutByIndex((current) => (sameColumnLayoutRecord(current, nextLayoutByIndex) ? current : nextLayoutByIndex))
    if (measurementsChanged || layoutChanged) onLayoutMeasuredRef.current()
  }, [input.canvasRef, input.canvasSurfaceElement, input.workspace.columns])

  const scheduleMeasurement = React.useCallback(() => {
    recomputeCasePreviewScale()
    if (typeof window === "undefined") {
      measure()
      return
    }
    if (layoutFrame.current) return
    layoutFrame.current = window.requestAnimationFrame(() => {
      layoutFrame.current = 0
      measure()
    })
  }, [measure, recomputeCasePreviewScale])

  useStudioLayoutEffect(() => {
    recomputeCasePreviewScale()
    measure()
  }, [input.canvasSurfaceElement, layoutMeasurementKey, measure, recomputeCasePreviewScale])

  React.useEffect(() => {
    return () => {
      if (layoutFrame.current) window.cancelAnimationFrame(layoutFrame.current)
    }
  }, [])

  return {
    casePreviewScale,
    columnLayoutByIndex,
    columnLayoutByIndexRef,
    columnMeasurementsByIndexRef,
    getCardElement,
    layoutMeasurementKey,
    scheduleMeasurement,
    setCardElement,
    setColumnElement,
  }
}
