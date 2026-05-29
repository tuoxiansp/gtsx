"use client"

import React from "react"
import { createGPreviewRenderMessage, type GPreviewRenderTarget } from "@gtsx/core"

import { studioPreviewRenderTargetFromUrl } from "./client"
import type { StudioPreviewFrameSlot } from "./preview-frame-slot"
import { studioCanvasTransformChangedEventType } from "./studio-canvas-transform-event"

export type StudioPreviewIframeBorrowOrigin = "pool" | "new"

export type StudioPreviewIframeBorrowInput = {
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
}

export type StudioPreviewIframeMountState = {
  retainedRender?: boolean
}

export type StudioPreviewIframeBorrowLease = {
  origin: StudioPreviewIframeBorrowOrigin
  update: (input: StudioPreviewIframeBorrowInput) => void
  release: () => void
}

export type StudioPooledPreviewIframeProps = StudioPreviewIframeBorrowInput & {
  onBorrowOriginChange?: (origin: StudioPreviewIframeBorrowOrigin | null) => void
}

type StudioPreviewIframePoolEntry = {
  container?: HTMLElement
  currentSessionId?: string
  frame: HTMLIFrameElement
  id: number
  lastCompletedPreviewUrl?: string
  lastCompletedSessionId?: string
  lastCompletedSize?: { width: number | string; height: number }
  lastAcceptedRenderSessionId?: string
  lastPostedRenderKey?: string
  lastRenderedSessionId?: string
  owner?: symbol
  pendingInput?: StudioPreviewIframeBorrowInput
  pendingRenderDeliveryAttemptCount?: number
  pendingRenderEndpointRetryTimeout?: number
  pendingRenderRedeliveryTimeout?: number
  poolUrl: string
  ready: boolean
}

export type StudioPreviewIframePoolBorrowCandidate = {
  lastRenderedSessionId?: string
  owner?: unknown
  poolUrl: string
  ready: boolean
}

type StudioPreviewIframePoolStats = {
  active: number
  acceptedRenderPosts: number
  borrows: number
  created: number
  directRenderPosts: number
  idle: number
  newBorrows: number
  renderEndpointWaits: number
  postMessageRenderPosts: number
  readyIdle: number
  redeliveredRenderPosts: number
  renderPosts: number
  reusedBorrows: number
  total: number
}

type StudioPreviewIframePoolContextValue = {
  borrow(container: HTMLElement, input: StudioPreviewIframeBorrowInput): StudioPreviewIframeBorrowLease
}

export type StudioPreviewIframePoolPostRenderOptions = {
  force?: boolean
  redelivery?: boolean
}

type StudioPreviewIframePoolProviderProps = {
  children: React.ReactNode
  debug?: boolean
  maximumIdleFrames?: number
  minimumIdleReserveFrames?: number
  maximumRetainedFrames?: number
  poolUrl: string
}

const StudioPreviewIframePoolContext = React.createContext<StudioPreviewIframePoolContextValue | null>(null)
const defaultStudioPreviewIframePoolMaximumIdleFrames = 48
const defaultStudioPreviewIframePoolMaximumRetainedFrames = 48
const defaultStudioPreviewIframePoolMinimumIdleReserveFrames = 0
const defaultStudioPreviewIframePoolPendingRenderRedeliveryDelayMilliseconds = 250
const defaultStudioPreviewIframePoolPendingRenderMaximumDeliveryAttempts = 12
const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

export function StudioPreviewIframePoolProvider(props: StudioPreviewIframePoolProviderProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const entriesRef = React.useRef<StudioPreviewIframePoolEntry[]>([])
  const borrowCountRef = React.useRef(0)
  const createdCountRef = React.useRef(0)
  const newBorrowCountRef = React.useRef(0)
  const nextIdRef = React.useRef(0)
  const placementFrameRef = React.useRef(0)
  const poolStatsFrameRef = React.useRef(0)
  const idleReserveFrameRef = React.useRef(0)
  const acceptedRenderPostCountRef = React.useRef(0)
  const directRenderPostCountRef = React.useRef(0)
  const postMessageRenderPostCountRef = React.useRef(0)
  const redeliveredRenderPostCountRef = React.useRef(0)
  const renderEndpointWaitCountRef = React.useRef(0)
  const renderPostCountRef = React.useRef(0)
  const reusedBorrowCountRef = React.useRef(0)
  const [poolStats, setPoolStats] = React.useState<StudioPreviewIframePoolStats>({
    active: 0,
    borrows: 0,
    created: 0,
    directRenderPosts: 0,
    idle: 0,
    newBorrows: 0,
    acceptedRenderPosts: 0,
    postMessageRenderPosts: 0,
    readyIdle: 0,
    renderEndpointWaits: 0,
    redeliveredRenderPosts: 0,
    renderPosts: 0,
    reusedBorrows: 0,
    total: 0,
  })
  const maximumIdleFrames = props.maximumIdleFrames ?? defaultStudioPreviewIframePoolMaximumIdleFrames
  const minimumIdleReserveFrames = props.minimumIdleReserveFrames ?? defaultStudioPreviewIframePoolMinimumIdleReserveFrames
  const maximumRetainedFrames = props.maximumRetainedFrames ?? defaultStudioPreviewIframePoolMaximumRetainedFrames

  const publishPoolStats = React.useCallback(() => {
    if (!props.debug) return
    if (poolStatsFrameRef.current) return

    poolStatsFrameRef.current = window.requestAnimationFrame(() => {
      poolStatsFrameRef.current = 0
      setPoolStats(
        snapshotStudioPreviewIframePoolStats(entriesRef.current, {
          acceptedRenderPosts: acceptedRenderPostCountRef.current,
          borrows: borrowCountRef.current,
          created: createdCountRef.current,
          directRenderPosts: directRenderPostCountRef.current,
          newBorrows: newBorrowCountRef.current,
          postMessageRenderPosts: postMessageRenderPostCountRef.current,
          redeliveredRenderPosts: redeliveredRenderPostCountRef.current,
          renderEndpointWaits: renderEndpointWaitCountRef.current,
          renderPosts: renderPostCountRef.current,
          reusedBorrows: reusedBorrowCountRef.current,
        }),
      )
    })
  }, [props.debug])

  const postPendingRender = React.useCallback((entry: StudioPreviewIframePoolEntry, options: StudioPreviewIframePoolPostRenderOptions = {}) => {
    if (!entry.pendingInput) return

    const renderKey = studioPreviewIframePendingRenderPostKey(entry.pendingInput)
    if (!studioPreviewIframePoolEntryNeedsPendingRenderPost(entry, renderKey, options)) return

    const target = studioPreviewRenderTargetFromUrl(entry.pendingInput.slot.previewUrl, entry.pendingInput.slot.sessionId)
    const renderEndpoint = readStudioPreviewIframeRenderEndpoint(entry.frame)
    if (!renderEndpoint) {
      renderEndpointWaitCountRef.current += 1
      scheduleStudioPreviewIframePoolPendingRenderEndpointRetry(entry, renderKey, postPendingRender)
      publishPoolStats()
      return
    }

    renderEndpoint.render(target)
    entry.pendingRenderDeliveryAttemptCount = studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount(entry, renderKey)
    entry.lastPostedRenderKey = renderKey
    entry.lastRenderedSessionId = target.sessionId ?? entry.pendingInput.slot.sessionId
    entry.frame.dataset.gtsxPreviewPoolLastRenderSessionId = target.sessionId ?? ""
    entry.frame.dataset.gtsxPreviewPoolRenderDeliveryAttemptCount = String(entry.pendingRenderDeliveryAttemptCount)
    if (renderEndpoint.transport === "direct") {
      directRenderPostCountRef.current += 1
    } else {
      postMessageRenderPostCountRef.current += 1
    }
    renderPostCountRef.current += 1
    if (options.redelivery) redeliveredRenderPostCountRef.current += 1
    scheduleStudioPreviewIframePoolPendingRenderRedelivery(entry, renderKey, postPendingRender)
    publishPoolStats()
  }, [publishPoolStats])

  const postPendingRenderIfPoolEntryIsReady = React.useCallback(
    (entry: StudioPreviewIframePoolEntry) => {
      if (!entry.ready) return
      postPendingRender(entry)
    },
    [postPendingRender],
  )

  const createEntry = React.useCallback((): StudioPreviewIframePoolEntry => {
    const frame = document.createElement("iframe")
    const entry: StudioPreviewIframePoolEntry = {
      frame,
      id: nextIdRef.current++,
      poolUrl: props.poolUrl,
      ready: false,
    }

    createdCountRef.current += 1
    frame.setAttribute("aria-hidden", "true")
    frame.dataset.gtsxPooledPreviewFrame = "true"
    frame.dataset.gtsxPreviewPoolReady = "false"
    frame.loading = "eager"
    frame.tabIndex = -1
    Object.assign(frame.style, {
      background: "transparent",
      border: "0",
      height: "0",
      left: "0",
      pointerEvents: "none",
      position: "fixed",
      top: "0",
      transformOrigin: "0 0",
      visibility: "hidden",
      width: "0",
      zIndex: "1",
    } satisfies Partial<CSSStyleDeclaration>)
    frame.src = props.poolUrl

    entriesRef.current.push(entry)
    publishPoolStats()
    return entry
  }, [props.poolUrl, publishPoolStats])

  const createIdleReserveEntry = React.useCallback(() => {
    const host = hostRef.current
    if (!host) return

      const entry = createEntry()
    host.appendChild(entry.frame)
  }, [createEntry])

  const topUpIdleReserve = React.useCallback(() => {
    if (minimumIdleReserveFrames <= 0) return
    if (!hostRef.current) return
    if (entriesRef.current.length >= maximumRetainedFrames) return
    if (idleStudioPreviewIframePoolEntryCount(entriesRef.current) >= minimumIdleReserveFrames) return

    createIdleReserveEntry()
  }, [createIdleReserveEntry, maximumRetainedFrames, minimumIdleReserveFrames])

  const scheduleIdleReserveTopUp = React.useCallback(() => {
    if (typeof window === "undefined") return
    if (idleReserveFrameRef.current) return

    idleReserveFrameRef.current = window.requestAnimationFrame(() => {
      idleReserveFrameRef.current = 0
      topUpIdleReserve()
    })
  }, [topUpIdleReserve])

  const borrowEntry = React.useCallback((input: StudioPreviewIframeBorrowInput): { entry: StudioPreviewIframePoolEntry; origin: StudioPreviewIframeBorrowOrigin } => {
    const reusable = selectStudioPreviewIframePoolEntryForBorrow(entriesRef.current, {
      maximumRetainedFrames,
      poolUrl: props.poolUrl,
      sessionId: input.slot.sessionId,
    })
    return reusable ? { entry: reusable, origin: "pool" } : { entry: createEntry(), origin: "new" }
  }, [createEntry, maximumRetainedFrames, props.poolUrl])

  const pruneIdleFrames = React.useCallback(() => {
    const idleEntries = entriesRef.current.filter((entry) => !entry.owner)
    const removableCount = Math.max(
      0,
      idleEntries.length - maximumIdleFrames,
      entriesRef.current.length - maximumRetainedFrames,
    )
    if (removableCount <= 0) return

    const removable = new Set(idleEntries.slice(0, removableCount).map((entry) => entry.id))
    entriesRef.current = entriesRef.current.filter((entry) => {
      if (!removable.has(entry.id)) return true
      clearStudioPreviewIframePoolPendingRenderDelivery(entry)
      entry.frame.remove()
      return false
    })
  }, [maximumIdleFrames, maximumRetainedFrames])

  const applyActiveFramePlacements = React.useCallback(() => {
    for (const entry of entriesRef.current) {
      if (entry.owner) applyStudioPreviewIframePoolEntryPlacement(entry)
    }
  }, [])

  const scheduleActiveFramePlacementUpdate = React.useCallback(() => {
    if (placementFrameRef.current) return

    placementFrameRef.current = window.requestAnimationFrame(() => {
      placementFrameRef.current = 0
      applyActiveFramePlacements()
    })
  }, [applyActiveFramePlacements])

  const borrow = React.useCallback(
    (container: HTMLElement, input: StudioPreviewIframeBorrowInput): StudioPreviewIframeBorrowLease => {
      const { entry, origin } = borrowEntry(input)
      const owner = Symbol(input.slot.sessionId)
      const host = hostRef.current
      borrowCountRef.current += 1
      if (origin === "new") {
        newBorrowCountRef.current += 1
      } else {
        reusedBorrowCountRef.current += 1
      }
      entry.owner = owner
      entry.container = container
      if (host && entry.frame.parentElement !== host) host.appendChild(entry.frame)
      applyBorrowInput(entry, input, postPendingRenderIfPoolEntryIsReady)
      publishPoolStats()
      scheduleIdleReserveTopUp()
      scheduleActiveFramePlacementUpdate()

      return {
        origin,
        update(nextInput) {
          if (entry.owner !== owner) return
          entry.container = container
          applyBorrowInput(entry, nextInput, postPendingRenderIfPoolEntryIsReady)
          scheduleActiveFramePlacementUpdate()
        },
        release() {
          if (entry.owner !== owner) return

          entry.pendingInput?.onPreviewFrameMount?.(entry.pendingInput.slot.sessionId, null)
          clearStudioPreviewIframePoolLeaseDebugAttributes(entry)
          entry.owner = undefined
          entry.container = undefined
          entry.currentSessionId = undefined
          entry.pendingInput = undefined
          clearStudioPreviewIframePoolPendingRenderDelivery(entry)
          hideStudioPreviewIframePoolEntryFrame(entry)
          pruneIdleFrames()
          publishPoolStats()
          scheduleIdleReserveTopUp()
        },
      }
    },
    [
      borrowEntry,
      postPendingRenderIfPoolEntryIsReady,
      pruneIdleFrames,
      publishPoolStats,
      scheduleActiveFramePlacementUpdate,
      scheduleIdleReserveTopUp,
    ],
  )

  React.useEffect(() => {
    if (!props.debug) return
    setPoolStats(
      snapshotStudioPreviewIframePoolStats(entriesRef.current, {
        acceptedRenderPosts: acceptedRenderPostCountRef.current,
        borrows: borrowCountRef.current,
        created: createdCountRef.current,
        directRenderPosts: directRenderPostCountRef.current,
        newBorrows: newBorrowCountRef.current,
        postMessageRenderPosts: postMessageRenderPostCountRef.current,
        redeliveredRenderPosts: redeliveredRenderPostCountRef.current,
        renderEndpointWaits: renderEndpointWaitCountRef.current,
        renderPosts: renderPostCountRef.current,
        reusedBorrows: reusedBorrowCountRef.current,
      }),
    )
  }, [props.debug])

  React.useEffect(() => {
    const schedulePlacement = () => scheduleActiveFramePlacementUpdate()

    window.addEventListener("resize", schedulePlacement)
    window.addEventListener("scroll", schedulePlacement, true)
    window.addEventListener(studioCanvasTransformChangedEventType, schedulePlacement)
    return () => {
      window.removeEventListener("resize", schedulePlacement)
      window.removeEventListener("scroll", schedulePlacement, true)
      window.removeEventListener(studioCanvasTransformChangedEventType, schedulePlacement)
    }
  }, [scheduleActiveFramePlacementUpdate])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (isStudioPreviewPoolReadyMessage(event.data)) {
        const entry = entriesRef.current.find((candidate) => candidate.frame.contentWindow === event.source)
        if (!entry) return

        entry.ready = true
        entry.frame.dataset.gtsxPreviewPoolReady = "true"
        publishPoolStats()
        scheduleIdleReserveTopUp()
        clearStudioPreviewIframePoolPendingRenderDelivery(entry)
        postPendingRender(entry)
        return
      }

      if (isStudioPreviewRenderAcceptedMessage(event.data)) {
        const entry = entriesRef.current.find((candidate) => candidate.frame.contentWindow === event.source)
        if (!entry || entry.pendingInput?.slot.sessionId !== event.data.sessionId) return

        entry.lastAcceptedRenderSessionId = event.data.sessionId
        entry.frame.dataset.gtsxPreviewPoolLastAcceptedRenderSessionId = event.data.sessionId
        clearStudioPreviewIframePoolPendingRenderRedelivery(entry)
        acceptedRenderPostCountRef.current += 1
        publishPoolStats()
        return
      }

      if (isStudioPreviewSessionCompletionMessage(event.data)) {
        const entry = entriesRef.current.find((candidate) => candidate.frame.contentWindow === event.source)
        if (!entry || entry.pendingInput?.slot.sessionId !== event.data.sessionId) return

        entry.lastCompletedSessionId = event.data.sessionId
        entry.lastCompletedPreviewUrl = entry.pendingInput.slot.previewUrl
        entry.lastCompletedSize = entry.pendingInput.size
        clearStudioPreviewIframePoolPendingRenderDelivery(entry)
        entry.frame.style.opacity = "1"
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [postPendingRender, publishPoolStats, scheduleIdleReserveTopUp])

  React.useEffect(() => {
    scheduleIdleReserveTopUp()
  }, [scheduleIdleReserveTopUp])

  React.useEffect(() => {
    return () => {
      for (const entry of entriesRef.current) {
        clearStudioPreviewIframePoolPendingRenderDelivery(entry)
        entry.frame.remove()
      }
      if (poolStatsFrameRef.current) window.cancelAnimationFrame(poolStatsFrameRef.current)
      if (placementFrameRef.current) window.cancelAnimationFrame(placementFrameRef.current)
      if (idleReserveFrameRef.current) window.cancelAnimationFrame(idleReserveFrameRef.current)
      entriesRef.current = []
    }
  }, [])

  const value = React.useMemo(() => ({ borrow }), [borrow])

  return (
    <StudioPreviewIframePoolContext.Provider value={value}>
      {props.children}
      <div
        aria-hidden="true"
        data-gtsx-preview-iframe-pool="true"
        ref={hostRef}
        style={{
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
          position: "fixed",
          zIndex: 2,
        }}
      />
      {props.debug ? <StudioPreviewIframePoolStatsPanel stats={poolStats} /> : null}
    </StudioPreviewIframePoolContext.Provider>
  )
}

export function StudioPooledPreviewIframe(props: StudioPooledPreviewIframeProps) {
  const pool = useStudioPreviewIframePool()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const borrowInputRef = React.useRef<StudioPreviewIframeBorrowInput | null>(null)
  const leaseRef = React.useRef<StudioPreviewIframeBorrowLease | null>(null)
  const onPreviewFrameMountRef = React.useRef(props.onPreviewFrameMount)
  const onBorrowOriginChangeRef = React.useRef(props.onBorrowOriginChange)
  onPreviewFrameMountRef.current = props.onPreviewFrameMount
  onBorrowOriginChangeRef.current = props.onBorrowOriginChange
  const borrowInput = React.useMemo<StudioPreviewIframeBorrowInput>(
    () => ({
      size: props.size,
      slot: props.slot,
      onPreviewFrameMount(sessionId, frame, state) {
        onPreviewFrameMountRef.current?.(sessionId, frame, state)
      },
    }),
    [props.size.height, props.size.width, props.slot.previewUrl, props.slot.sessionId, props.slot.title],
  )
  borrowInputRef.current = borrowInput

  useStudioLayoutEffect(() => {
    if (!pool || !containerRef.current) return

    const initialBorrowInput = borrowInputRef.current
    if (!initialBorrowInput) return

    const lease = pool.borrow(containerRef.current, initialBorrowInput)
    leaseRef.current = lease
    onBorrowOriginChangeRef.current?.(lease.origin)
    return () => releasePooledPreviewIframeLease(leaseRef, onBorrowOriginChangeRef)
  }, [pool])

  useStudioLayoutEffect(() => {
    leaseRef.current?.update(borrowInput)
    if (leaseRef.current) onBorrowOriginChangeRef.current?.(leaseRef.current.origin)
  }, [borrowInput])

  if (!pool) return null

  return (
    <div
      data-gtsx-pooled-preview-slot={props.slot.sessionId}
      ref={containerRef}
      style={{
        height: props.size.height,
        left: 0,
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        width: props.size.width,
        zIndex: 1,
      }}
    />
  )
}

function releasePooledPreviewIframeLease(
  leaseRef: React.MutableRefObject<StudioPreviewIframeBorrowLease | null>,
  onBorrowOriginChangeRef: React.MutableRefObject<StudioPooledPreviewIframeProps["onBorrowOriginChange"]>,
) {
  onBorrowOriginChangeRef.current?.(null)
  leaseRef.current?.release()
  leaseRef.current = null
}

export function useStudioPreviewIframePool(): StudioPreviewIframePoolContextValue | null {
  return React.useContext(StudioPreviewIframePoolContext)
}

export function studioPreviewIframeBorrowKey(input: StudioPreviewIframeBorrowInput): string {
  return input.slot.sessionId
}

export function selectStudioPreviewIframePoolEntryForBorrow<Entry extends StudioPreviewIframePoolBorrowCandidate>(
  entries: readonly Entry[],
  input: {
    maximumRetainedFrames: number
    poolUrl: string
    sessionId: string
  },
): Entry | undefined {
  const idleEntries = entries.filter((entry) => !entry.owner && entry.poolUrl === input.poolUrl)
  const exactSessionEntry = idleEntries.find((entry) => entry.ready && entry.lastRenderedSessionId === input.sessionId)
  if (exactSessionEntry) return exactSessionEntry

  const readyStatelessEntry = idleEntries.find((entry) => entry.ready && !entry.lastRenderedSessionId)
  if (readyStatelessEntry) return readyStatelessEntry

  const readyStaleEntry = idleEntries.find((entry) => entry.ready)
  if (readyStaleEntry) return readyStaleEntry

  return undefined
}

function cssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value
}

type StudioPreviewIframePoolRect = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export type StudioPreviewIframePoolPlacement = {
  clipPath: string
  height: string
  transform: string
  visibility: "hidden" | "visible"
  width: string
}

export function studioPreviewIframePoolPlacementForAnchor(input: {
  anchorRect: StudioPreviewIframePoolRect
  clipRect: StudioPreviewIframePoolRect
  layoutSize: { width: number | string; height: number | string }
}): StudioPreviewIframePoolPlacement {
  if (input.anchorRect.width <= 0 || input.anchorRect.height <= 0) {
    return hiddenStudioPreviewIframePoolPlacement(input.layoutSize)
  }

  const layoutWidth = studioPreviewIframePoolLayoutPixels(input.layoutSize.width, input.anchorRect.width)
  const layoutHeight = studioPreviewIframePoolLayoutPixels(input.layoutSize.height, input.anchorRect.height)
  const scaleX = layoutWidth > 0 ? input.anchorRect.width / layoutWidth : 1
  const scaleY = layoutHeight > 0 ? input.anchorRect.height / layoutHeight : 1
  const clipTop = Math.max(0, input.clipRect.top - input.anchorRect.top) / scaleY
  const clipRight = Math.max(0, input.anchorRect.right - input.clipRect.right) / scaleX
  const clipBottom = Math.max(0, input.anchorRect.bottom - input.clipRect.bottom) / scaleY
  const clipLeft = Math.max(0, input.clipRect.left - input.anchorRect.left) / scaleX

  return {
    clipPath: `inset(${roundStudioPreviewIframePoolPlacementPixel(clipTop)}px ${roundStudioPreviewIframePoolPlacementPixel(clipRight)}px ${roundStudioPreviewIframePoolPlacementPixel(clipBottom)}px ${roundStudioPreviewIframePoolPlacementPixel(clipLeft)}px)`,
    height: `${roundStudioPreviewIframePoolPlacementPixel(layoutHeight)}px`,
    transform: `translate3d(${roundStudioPreviewIframePoolPlacementPixel(input.anchorRect.left)}px, ${roundStudioPreviewIframePoolPlacementPixel(input.anchorRect.top)}px, 0) scale(${roundStudioPreviewIframePoolPlacementScale(scaleX)}, ${roundStudioPreviewIframePoolPlacementScale(scaleY)})`,
    visibility: "visible",
    width: `${roundStudioPreviewIframePoolPlacementPixel(layoutWidth)}px`,
  }
}

function applyStudioPreviewIframePoolEntryPlacement(entry: StudioPreviewIframePoolEntry) {
  const input = entry.pendingInput
  const container = entry.container
  if (!input || !container?.isConnected) {
    hideStudioPreviewIframePoolEntryFrame(entry)
    return
  }

  const anchorRect = container.getBoundingClientRect()
  const clipElement = container.closest("[data-gtsx-preview-clip]")
  const clipRect = clipElement instanceof HTMLElement ? clipElement.getBoundingClientRect() : anchorRect
  Object.assign(
    entry.frame.style,
    studioPreviewIframePoolPlacementForAnchor({
      anchorRect,
      clipRect,
      layoutSize: input.size,
    }) satisfies Partial<CSSStyleDeclaration>,
  )
}

function hideStudioPreviewIframePoolEntryFrame(entry: StudioPreviewIframePoolEntry) {
  Object.assign(entry.frame.style, hiddenStudioPreviewIframePoolPlacement(entry.pendingInput?.size ?? { width: 0, height: 0 }))
}

function hiddenStudioPreviewIframePoolPlacement(size: { width: number | string; height: number | string }): StudioPreviewIframePoolPlacement {
  return {
    clipPath: "inset(0px)",
    height: cssSize(size.height),
    transform: "translate3d(-100000px, -100000px, 0)",
    visibility: "hidden",
    width: cssSize(size.width),
  }
}

function studioPreviewIframePoolLayoutPixels(value: number | string, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  if (typeof value === "string" && value.endsWith("px")) {
    const parsed = Number(value.slice(0, -2))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return Math.max(0, fallback)
}

function roundStudioPreviewIframePoolPlacementPixel(value: number): number {
  return Math.round(value * 100) / 100
}

function roundStudioPreviewIframePoolPlacementScale(value: number): number {
  return Math.round(value * 10000) / 10000
}

function applyBorrowInput(
  entry: StudioPreviewIframePoolEntry,
  input: StudioPreviewIframeBorrowInput,
  schedulePendingRender: (entry: StudioPreviewIframePoolEntry) => void,
) {
  const previousInput = entry.pendingInput
  const previousSessionId = previousInput?.slot.sessionId
  const nextSessionId = input.slot.sessionId
  const retainedRender = studioPreviewIframePoolEntryRetainsCompletedRender(entry, input)
  const renderInputChanged = studioPreviewIframeBorrowInputNeedsRender(previousInput, input)

  entry.currentSessionId = nextSessionId
  entry.pendingInput = input
  writeStudioPreviewIframePoolLeaseDebugAttributes(entry, input)
  entry.frame.title = input.slot.title
  entry.frame.style.height = cssSize(input.size.height)
  entry.frame.style.width = cssSize(input.size.width)
  applyStudioPreviewIframePoolEntryPlacement(entry)
  if (retainedRender) entry.frame.style.opacity = "1"

  if (previousSessionId !== nextSessionId) {
    if (retainedRender) {
      entry.frame.dataset.gtsxPreviewPoolLastRenderSessionId = nextSessionId
    } else {
      delete entry.frame.dataset.gtsxPreviewPoolLastRenderSessionId
    }
    if (previousSessionId) previousInput?.onPreviewFrameMount?.(previousSessionId, null)
    input.onPreviewFrameMount?.(nextSessionId, entry.frame, { retainedRender })
  }

  if (renderInputChanged && !retainedRender) {
    clearStudioPreviewIframePoolCompletedRender(entry)
    clearStudioPreviewIframePoolPendingRenderDelivery(entry)
    entry.frame.style.opacity = "0"
    schedulePendingRender(entry)
  }
}

function writeStudioPreviewIframePoolLeaseDebugAttributes(
  entry: StudioPreviewIframePoolEntry,
  input: StudioPreviewIframeBorrowInput,
) {
  entry.frame.dataset.gtsxPreviewPoolEntryId = String(entry.id)
  entry.frame.dataset.gtsxPreviewPoolLeaseSessionId = input.slot.sessionId
  entry.frame.dataset.gtsxPreviewPoolReady = entry.ready ? "true" : "false"
}

function clearStudioPreviewIframePoolLeaseDebugAttributes(entry: StudioPreviewIframePoolEntry) {
  delete entry.frame.dataset.gtsxPreviewPoolLeaseSessionId
  delete entry.frame.dataset.gtsxPreviewPoolLastAcceptedRenderSessionId
  delete entry.frame.dataset.gtsxPreviewPoolLastRenderSessionId
  delete entry.frame.dataset.gtsxPreviewPoolRenderDeliveryAttemptCount
}

function studioPreviewIframePoolEntryRetainsCompletedRender(
  entry: StudioPreviewIframePoolEntry,
  input: StudioPreviewIframeBorrowInput,
): boolean {
  return (
    entry.lastCompletedSessionId === input.slot.sessionId &&
    entry.lastCompletedPreviewUrl === input.slot.previewUrl &&
    entry.lastCompletedSize?.height === input.size.height &&
    entry.lastCompletedSize.width === input.size.width
  )
}

function clearStudioPreviewIframePoolCompletedRender(entry: StudioPreviewIframePoolEntry) {
  delete entry.lastCompletedSessionId
  delete entry.lastCompletedPreviewUrl
  delete entry.lastCompletedSize
}

type StudioPreviewIframeRenderEndpoint = {
  render: (target: GPreviewRenderTarget) => void
  transport: "direct" | "postMessage"
}

function readStudioPreviewIframeRenderEndpoint(
  frame: HTMLIFrameElement,
): StudioPreviewIframeRenderEndpoint | undefined {
  const contentWindow = frame.contentWindow
  if (!contentWindow) return undefined

  try {
    const directMailbox = (contentWindow as Window & {
      __gtsxPreviewRenderTargetMailbox?: { render: (target: GPreviewRenderTarget) => void }
    }).__gtsxPreviewRenderTargetMailbox
    return directMailbox ? { render: directMailbox.render, transport: "direct" } : undefined
  } catch {
    return {
      render(target) {
        contentWindow.postMessage(createGPreviewRenderMessage(target), "*")
      },
      transport: "postMessage",
    }
  }
}

export function studioPreviewIframePendingRenderPostKey(input: StudioPreviewIframeBorrowInput): string {
  return JSON.stringify({
    height: input.size.height,
    previewUrl: input.slot.previewUrl,
    sessionId: input.slot.sessionId,
    width: input.size.width,
  })
}

export function studioPreviewIframePoolEntryNeedsPendingRenderPost(
  entry: { lastPostedRenderKey?: string },
  renderKey: string,
  options: StudioPreviewIframePoolPostRenderOptions = {},
): boolean {
  if (options.force) return true
  return entry.lastPostedRenderKey !== renderKey
}

export function studioPreviewIframePoolNextPendingRenderDeliveryAttemptCount(
  entry: { lastPostedRenderKey?: string; pendingRenderDeliveryAttemptCount?: number },
  renderKey: string,
): number {
  return entry.lastPostedRenderKey === renderKey ? (entry.pendingRenderDeliveryAttemptCount ?? 0) + 1 : 1
}

function scheduleStudioPreviewIframePoolPendingRenderRedelivery(
  entry: StudioPreviewIframePoolEntry,
  renderKey: string,
  postPendingRender: (entry: StudioPreviewIframePoolEntry, options?: StudioPreviewIframePoolPostRenderOptions) => void,
) {
  clearStudioPreviewIframePoolPendingRenderRedelivery(entry)
  if ((entry.pendingRenderDeliveryAttemptCount ?? 0) >= defaultStudioPreviewIframePoolPendingRenderMaximumDeliveryAttempts) {
    return
  }

  entry.pendingRenderRedeliveryTimeout = window.setTimeout(() => {
    entry.pendingRenderRedeliveryTimeout = undefined
    if (!entry.pendingInput) return
    if (studioPreviewIframePendingRenderPostKey(entry.pendingInput) !== renderKey) return
    if (studioPreviewIframePoolEntryRetainsCompletedRender(entry, entry.pendingInput)) return
    postPendingRender(entry, { force: true, redelivery: true })
  }, defaultStudioPreviewIframePoolPendingRenderRedeliveryDelayMilliseconds)
}

function scheduleStudioPreviewIframePoolPendingRenderEndpointRetry(
  entry: StudioPreviewIframePoolEntry,
  renderKey: string,
  postPendingRender: (entry: StudioPreviewIframePoolEntry, options?: StudioPreviewIframePoolPostRenderOptions) => void,
) {
  clearStudioPreviewIframePoolPendingRenderEndpointRetry(entry)
  entry.pendingRenderEndpointRetryTimeout = window.setTimeout(() => {
    entry.pendingRenderEndpointRetryTimeout = undefined
    if (!entry.pendingInput) return
    if (studioPreviewIframePendingRenderPostKey(entry.pendingInput) !== renderKey) return
    if (studioPreviewIframePoolEntryRetainsCompletedRender(entry, entry.pendingInput)) return
    postPendingRender(entry, { force: true })
  }, 50)
}

function clearStudioPreviewIframePoolPendingRenderEndpointRetry(entry: StudioPreviewIframePoolEntry) {
  if (!entry.pendingRenderEndpointRetryTimeout) return

  window.clearTimeout(entry.pendingRenderEndpointRetryTimeout)
  entry.pendingRenderEndpointRetryTimeout = undefined
}

function clearStudioPreviewIframePoolPendingRenderRedelivery(entry: StudioPreviewIframePoolEntry) {
  if (!entry.pendingRenderRedeliveryTimeout) return

  window.clearTimeout(entry.pendingRenderRedeliveryTimeout)
  entry.pendingRenderRedeliveryTimeout = undefined
}

function clearStudioPreviewIframePoolPendingRenderDelivery(entry: StudioPreviewIframePoolEntry) {
  clearStudioPreviewIframePoolPendingRenderEndpointRetry(entry)
  clearStudioPreviewIframePoolPendingRenderRedelivery(entry)
  delete entry.lastPostedRenderKey
  delete entry.pendingRenderDeliveryAttemptCount
  delete entry.frame.dataset.gtsxPreviewPoolRenderDeliveryAttemptCount
}

export function studioPreviewIframeBorrowInputNeedsRender(
  previousInput: StudioPreviewIframeBorrowInput | undefined,
  nextInput: StudioPreviewIframeBorrowInput,
): boolean {
  return (
    !previousInput ||
    previousInput.slot.sessionId !== nextInput.slot.sessionId ||
    previousInput.slot.previewUrl !== nextInput.slot.previewUrl ||
    previousInput.size.height !== nextInput.size.height ||
    previousInput.size.width !== nextInput.size.width
  )
}

function isStudioPreviewPoolReadyMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "gtsx:pool-ready" &&
    (value as { protocolVersion?: unknown }).protocolVersion === 1
  )
}

function isStudioPreviewRenderAcceptedMessage(value: unknown): value is { sessionId: string; type: "gtsx:render-accepted" } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "gtsx:render-accepted" &&
    (value as { protocolVersion?: unknown }).protocolVersion === 1 &&
    typeof (value as { sessionId?: unknown }).sessionId === "string"
  )
}

function isStudioPreviewSessionCompletionMessage(value: unknown): value is { sessionId: string; type: "gtsx:ready" | "gtsx:error" } {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as { type?: unknown }).type === "gtsx:ready" || (value as { type?: unknown }).type === "gtsx:error") &&
    typeof (value as { sessionId?: unknown }).sessionId === "string"
  )
}

function snapshotStudioPreviewIframePoolStats(
  entries: StudioPreviewIframePoolEntry[],
  counts: {
    acceptedRenderPosts: number
    borrows: number
    created: number
    directRenderPosts: number
    newBorrows: number
    postMessageRenderPosts: number
    redeliveredRenderPosts: number
    renderEndpointWaits: number
    renderPosts: number
    reusedBorrows: number
  },
): StudioPreviewIframePoolStats {
  const active = entries.filter((entry) => entry.owner).length
  return {
    active,
    acceptedRenderPosts: counts.acceptedRenderPosts,
    borrows: counts.borrows,
    created: counts.created,
    directRenderPosts: counts.directRenderPosts,
    idle: entries.length - active,
    newBorrows: counts.newBorrows,
    postMessageRenderPosts: counts.postMessageRenderPosts,
    readyIdle: readyIdleStudioPreviewIframePoolEntryCount(entries),
    redeliveredRenderPosts: counts.redeliveredRenderPosts,
    renderEndpointWaits: counts.renderEndpointWaits,
    renderPosts: counts.renderPosts,
    reusedBorrows: counts.reusedBorrows,
    total: entries.length,
  }
}

function readyIdleStudioPreviewIframePoolEntryCount(entries: readonly StudioPreviewIframePoolEntry[]): number {
  return entries.filter((entry) => !entry.owner && entry.ready).length
}

function idleStudioPreviewIframePoolEntryCount(entries: readonly StudioPreviewIframePoolEntry[]): number {
  return entries.filter((entry) => !entry.owner).length
}

function StudioPreviewIframePoolStatsPanel(props: { stats: StudioPreviewIframePoolStats }) {
  return (
    <div
      aria-label="Preview iframe pool stats"
      data-gtsx-preview-iframe-pool-stats="true"
      data-gtsx-preview-iframe-pool-active={props.stats.active}
      data-gtsx-preview-iframe-pool-borrows={props.stats.borrows}
      data-gtsx-preview-iframe-pool-created={props.stats.created}
      data-gtsx-preview-iframe-pool-direct-render-posts={props.stats.directRenderPosts}
      data-gtsx-preview-iframe-pool-idle={props.stats.idle}
      data-gtsx-preview-iframe-pool-new-borrows={props.stats.newBorrows}
      data-gtsx-preview-iframe-pool-post-message-render-posts={props.stats.postMessageRenderPosts}
      data-gtsx-preview-iframe-pool-accepted-render-posts={props.stats.acceptedRenderPosts}
      data-gtsx-preview-iframe-pool-ready-idle={props.stats.readyIdle}
      data-gtsx-preview-iframe-pool-render-endpoint-waits={props.stats.renderEndpointWaits}
      data-gtsx-preview-iframe-pool-redelivered-render-posts={props.stats.redeliveredRenderPosts}
      data-gtsx-preview-iframe-pool-render-posts={props.stats.renderPosts}
      data-gtsx-preview-iframe-pool-reused-borrows={props.stats.reusedBorrows}
      data-gtsx-preview-iframe-pool-total={props.stats.total}
      style={{
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(216,222,232,0.95)",
        borderRadius: 6,
        bottom: 12,
        boxShadow: "0 6px 20px rgba(31,35,40,0.12)",
        color: "#1f2328",
        display: "flex",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        gap: 8,
        left: 12,
        lineHeight: 1.3,
        padding: "6px 8px",
        pointerEvents: "none",
        position: "fixed",
        zIndex: 10,
      }}
    >
      <span>pool {props.stats.total}</span>
      <span>active {props.stats.active}</span>
      <span>idle {props.stats.idle}</span>
      <span>ready idle {props.stats.readyIdle}</span>
      <span>created {props.stats.created}</span>
      <span>borrow {props.stats.borrows}</span>
      <span>new {props.stats.newBorrows}</span>
      <span>reuse {props.stats.reusedBorrows}</span>
      <span>render {props.stats.renderPosts}</span>
      <span>direct {props.stats.directRenderPosts}</span>
      <span>postMessage {props.stats.postMessageRenderPosts}</span>
      <span>wait endpoint {props.stats.renderEndpointWaits}</span>
      <span>accepted {props.stats.acceptedRenderPosts}</span>
      <span>redelivered {props.stats.redeliveredRenderPosts}</span>
    </div>
  )
}
