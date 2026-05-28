"use client"

import React from "react"

import {
  applyStudioCanvasWheel,
  defaultStudioCanvasTransform,
  type StudioCanvasTransform,
} from "./client"
import { studioCanvasTransformStyle } from "./studio-canvas-geometry"
import { dispatchStudioCanvasTransformChangedEvent } from "./studio-canvas-transform-event"

type MutableRef<T> = {
  current: T
}

type StudioCanvasViewportPoint = {
  x: number
  y: number
}

type LastKnownStudioCanvasPointerViewportPoint = StudioCanvasViewportPoint & {
  observedAtMilliseconds: number
}

type StudioCanvasPointerPan = {
  originX: number
  originY: number
  pointerId: number
  startX: number
  startY: number
}

export type StudioCanvasController = {
  canvas: StudioCanvasTransform
  canvasRef: MutableRef<StudioCanvasTransform>
  canvasSurfaceElement: HTMLDivElement | null
  canvasViewportElement: HTMLDivElement | null
  moveCanvas: (updater: (current: StudioCanvasTransform) => StudioCanvasTransform) => void
  onCanvasPointerCancel: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerDown: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerMove: React.PointerEventHandler<HTMLDivElement>
  onCanvasPointerUp: React.PointerEventHandler<HTMLDivElement>
  setCanvasSurfaceElement: (element: HTMLDivElement | null) => void
  setCanvasViewportElement: (element: HTMLDivElement | null) => void
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
const studioCanvasFreshPointerWheelZoomFocalPointMilliseconds = 1_500

export function useStudioCanvasController(input: {
  canvas?: StudioCanvasTransform
  onCanvasChange?: (canvas: StudioCanvasTransform) => void
  onCanvasMove: (canvas: StudioCanvasTransform) => void
  onCanvasPanEnd: () => void
  shouldHandleWheelTarget: (target: EventTarget | null) => boolean
}): StudioCanvasController {
  const [uncontrolledCanvas, setUncontrolledCanvas] = React.useState<StudioCanvasTransform>(() => defaultStudioCanvasTransform())
  const [canvasSurfaceElement, setCanvasSurfaceElementState] = React.useState<HTMLDivElement | null>(null)
  const [canvasViewportElement, setCanvasViewportElementState] = React.useState<HTMLDivElement | null>(null)
  const canvas = input.canvas ?? uncontrolledCanvas
  const canvasRef = React.useRef(canvas)
  const canvasSurfaceElementRef = React.useRef<HTMLDivElement | null>(null)
  const lastKnownPointerViewportPoint = React.useRef<LastKnownStudioCanvasPointerViewportPoint | null>(null)
  const panRef = React.useRef<StudioCanvasPointerPan | null>(null)
  const onCanvasChangeRef = React.useRef(input.onCanvasChange)
  const onCanvasMoveRef = React.useRef(input.onCanvasMove)
  const onCanvasPanEndRef = React.useRef(input.onCanvasPanEnd)
  const shouldHandleWheelTargetRef = React.useRef(input.shouldHandleWheelTarget)
  onCanvasChangeRef.current = input.onCanvasChange
  onCanvasMoveRef.current = input.onCanvasMove
  onCanvasPanEndRef.current = input.onCanvasPanEnd
  shouldHandleWheelTargetRef.current = input.shouldHandleWheelTarget

  const writeCanvasTransform = React.useCallback((nextCanvas: StudioCanvasTransform) => {
    const canvasSurface = canvasSurfaceElementRef.current
    if (canvasSurface) canvasSurface.style.transform = studioCanvasTransformStyle(nextCanvas)
    dispatchStudioCanvasTransformChangedEvent(nextCanvas)
  }, [])

  const moveCanvas = React.useCallback(
    (updater: (current: StudioCanvasTransform) => StudioCanvasTransform) => {
      const nextCanvas = updater(canvasRef.current)
      if (sameStudioCanvasTransform(canvasRef.current, nextCanvas)) return

      canvasRef.current = nextCanvas
      writeCanvasTransform(nextCanvas)
      onCanvasMoveRef.current(nextCanvas)

      if (onCanvasChangeRef.current) {
        onCanvasChangeRef.current(nextCanvas)
      } else {
        setUncontrolledCanvas(nextCanvas)
      }
    },
    [writeCanvasTransform],
  )

  const rememberPointerViewportPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasViewportElement) return
      const viewportRect = canvasViewportElement.getBoundingClientRect()
      const point = {
        x: clientX - viewportRect.left,
        y: clientY - viewportRect.top,
      }
      if (studioCanvasViewportPointIsInsideViewport(point, viewportRect)) {
        lastKnownPointerViewportPoint.current = {
          ...point,
          observedAtMilliseconds: studioPerformanceNow(),
        }
      }
    },
    [canvasViewportElement],
  )

  useStudioLayoutEffect(() => {
    if (sameStudioCanvasTransform(canvasRef.current, canvas)) return
    canvasRef.current = canvas
    writeCanvasTransform(canvas)
    onCanvasMoveRef.current(canvas)
  }, [canvas, writeCanvasTransform])

  const setCanvasSurfaceElement = React.useCallback(
    (element: HTMLDivElement | null) => {
      canvasSurfaceElementRef.current = element
      if (element) element.style.transform = studioCanvasTransformStyle(canvasRef.current)
      setCanvasSurfaceElementState(element)
    },
    [],
  )

  const setCanvasViewportElement = React.useCallback((element: HTMLDivElement | null) => {
    setCanvasViewportElementState(element)
  }, [])

  const onCanvasPointerCancel = React.useCallback<React.PointerEventHandler<HTMLDivElement>>((event) => {
    if (panRef.current?.pointerId !== event.pointerId) return

    panRef.current = null
    onCanvasPanEndRef.current()
  }, [])

  const onCanvasPointerDown = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      rememberPointerViewportPoint(event.clientX, event.clientY)
      if ((event.target as HTMLElement).closest("a,button,iframe")) return

      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: canvasRef.current.x,
        originY: canvasRef.current.y,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Browsers can cancel trackpad pointer streams before React handles them.
      }
    },
    [rememberPointerViewportPoint],
  )

  const onCanvasPointerMove = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      rememberPointerViewportPoint(event.clientX, event.clientY)
      const pan = panRef.current
      if (!pan || pan.pointerId !== event.pointerId) return

      moveCanvas((current) => ({
        ...current,
        x: pan.originX + event.clientX - pan.startX,
        y: pan.originY + event.clientY - pan.startY,
      }))
    },
    [moveCanvas, rememberPointerViewportPoint],
  )

  const onCanvasPointerUp = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      rememberPointerViewportPoint(event.clientX, event.clientY)
      if (panRef.current?.pointerId !== event.pointerId) return

      panRef.current = null
      onCanvasPanEndRef.current()
    },
    [rememberPointerViewportPoint],
  )

  React.useEffect(() => {
    if (!canvasViewportElement) return

    const handleWheel = (event: WheelEvent) => {
      if (!shouldHandleWheelTargetRef.current(event.target)) return
      event.preventDefault()
      const viewportRect = canvasViewportElement.getBoundingClientRect()
      const eventViewportPoint = studioCanvasWheelEventViewportPoint(event, viewportRect)
      const now = studioPerformanceNow()
      const lastKnownPointer = lastKnownPointerViewportPoint.current
      const zoomFocalPoint =
        event.ctrlKey || event.metaKey
          ? chooseStudioCanvasWheelZoomFocalPoint({
              eventViewportPoint,
              lastKnownPointerAgeMilliseconds: lastKnownPointer
                ? now - lastKnownPointer.observedAtMilliseconds
                : undefined,
              lastKnownPointerViewportPoint: lastKnownPointer,
              viewportSize: { height: viewportRect.height, width: viewportRect.width },
            })
          : undefined

      if (eventViewportPoint && studioCanvasViewportPointIsInsideViewport(eventViewportPoint, viewportRect)) {
        lastKnownPointerViewportPoint.current = {
          ...eventViewportPoint,
          observedAtMilliseconds: now,
        }
      }

      moveCanvas((current) =>
        applyStudioCanvasWheel(current, {
          clientX: event.clientX,
          clientY: event.clientY,
          ctrlKey: event.ctrlKey,
          deltaMode: event.deltaMode,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          focalViewportX: zoomFocalPoint?.x,
          focalViewportY: zoomFocalPoint?.y,
          metaKey: event.metaKey,
          viewportLeft: viewportRect.left,
          viewportTop: viewportRect.top,
        }),
      )
    }

    canvasViewportElement.addEventListener("wheel", handleWheel, { passive: false })
    return () => canvasViewportElement.removeEventListener("wheel", handleWheel)
  }, [canvasViewportElement, moveCanvas])

  return React.useMemo(
    () => ({
      canvas,
      canvasRef,
      canvasSurfaceElement,
      canvasViewportElement,
      moveCanvas,
      onCanvasPointerCancel,
      onCanvasPointerDown,
      onCanvasPointerMove,
      onCanvasPointerUp,
      setCanvasSurfaceElement,
      setCanvasViewportElement,
    }),
    [
      canvas,
      canvasSurfaceElement,
      canvasViewportElement,
      moveCanvas,
      onCanvasPointerCancel,
      onCanvasPointerDown,
      onCanvasPointerMove,
      onCanvasPointerUp,
      setCanvasSurfaceElement,
      setCanvasViewportElement,
    ],
  )
}

export function chooseStudioCanvasWheelZoomFocalPoint(input: {
  eventViewportPoint?: StudioCanvasViewportPoint
  lastKnownPointerAgeMilliseconds?: number
  lastKnownPointerViewportPoint: StudioCanvasViewportPoint | null
  viewportSize: { height: number; width: number }
}): StudioCanvasViewportPoint {
  const lastKnownPointer = input.lastKnownPointerViewportPoint
  const lastKnownPointerIsInsideViewport =
    lastKnownPointer !== null && studioCanvasViewportPointIsInsideViewport(lastKnownPointer, input.viewportSize)
  const lastKnownPointerIsFresh =
    typeof input.lastKnownPointerAgeMilliseconds === "number" &&
    input.lastKnownPointerAgeMilliseconds <= studioCanvasFreshPointerWheelZoomFocalPointMilliseconds

  if (lastKnownPointerIsInsideViewport && lastKnownPointerIsFresh) return lastKnownPointer

  if (input.eventViewportPoint && studioCanvasViewportPointIsInsideViewport(input.eventViewportPoint, input.viewportSize)) {
    return input.eventViewportPoint
  }

  if (lastKnownPointerIsInsideViewport) {
    return lastKnownPointer
  }

  return {
    x: input.viewportSize.width / 2,
    y: input.viewportSize.height / 2,
  }
}

function studioCanvasWheelEventViewportPoint(
  event: WheelEvent,
  viewportRect: Pick<DOMRect, "left" | "top">,
): StudioCanvasViewportPoint | undefined {
  if (event.clientX === 0 && event.clientY === 0) return undefined
  return {
    x: event.clientX - viewportRect.left,
    y: event.clientY - viewportRect.top,
  }
}

function studioCanvasViewportPointIsInsideViewport(
  point: StudioCanvasViewportPoint,
  viewportSize: { height: number; width: number },
): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= viewportSize.width && point.y <= viewportSize.height
}

function sameStudioCanvasTransform(left: StudioCanvasTransform, right: StudioCanvasTransform): boolean {
  return left.x === right.x && left.y === right.y && left.scale === right.scale
}

function studioPerformanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}
