"use client"

import React from "react"
import { createGPreviewRenderMessage } from "gtsx"

import { studioPreviewRenderTargetFromUrl } from "./client"
import type { StudioPreviewFrameSlot } from "./preview-frame-slot"

export type StudioPreviewIframeBorrowOrigin = "pool" | "new"

export type StudioPreviewIframeBorrowInput = {
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  size: { width: number | string; height: number }
  slot: StudioPreviewFrameSlot
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
  currentSessionId?: string
  frame: HTMLIFrameElement
  id: number
  owner?: symbol
  pendingInput?: StudioPreviewIframeBorrowInput
  poolUrl: string
  ready: boolean
  renderRetryTimers: number[]
}

type StudioPreviewIframePoolStats = {
  active: number
  borrows: number
  created: number
  idle: number
  newBorrows: number
  reusedBorrows: number
  total: number
}

type StudioPreviewIframePoolContextValue = {
  borrow(container: HTMLElement, input: StudioPreviewIframeBorrowInput): StudioPreviewIframeBorrowLease
}

type StudioPreviewIframePoolProviderProps = {
  children: React.ReactNode
  debug?: boolean
  maxIdleFrames?: number
  poolUrl: string
}

const StudioPreviewIframePoolContext = React.createContext<StudioPreviewIframePoolContextValue | null>(null)
const defaultStudioPreviewIframePoolMaxIdleFrames = 24
const studioPreviewIframePoolRenderRetryDelays = [50, 150, 400, 1000]

export function StudioPreviewIframePoolProvider(props: StudioPreviewIframePoolProviderProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const entriesRef = React.useRef<StudioPreviewIframePoolEntry[]>([])
  const borrowCountRef = React.useRef(0)
  const createdCountRef = React.useRef(0)
  const newBorrowCountRef = React.useRef(0)
  const nextIdRef = React.useRef(0)
  const poolStatsFrameRef = React.useRef(0)
  const reusedBorrowCountRef = React.useRef(0)
  const [poolStats, setPoolStats] = React.useState<StudioPreviewIframePoolStats>({
    active: 0,
    borrows: 0,
    created: 0,
    idle: 0,
    newBorrows: 0,
    reusedBorrows: 0,
    total: 0,
  })
  const maxIdleFrames = props.maxIdleFrames ?? defaultStudioPreviewIframePoolMaxIdleFrames

  const publishPoolStats = React.useCallback(() => {
    if (!props.debug) return
    if (poolStatsFrameRef.current) return

    poolStatsFrameRef.current = window.requestAnimationFrame(() => {
      poolStatsFrameRef.current = 0
      setPoolStats(
        snapshotStudioPreviewIframePoolStats(entriesRef.current, {
          borrows: borrowCountRef.current,
          created: createdCountRef.current,
          newBorrows: newBorrowCountRef.current,
          reusedBorrows: reusedBorrowCountRef.current,
        }),
      )
    })
  }, [props.debug])

  const postPendingRender = React.useCallback((entry: StudioPreviewIframePoolEntry) => {
    if (!entry.pendingInput) return

    const target = studioPreviewRenderTargetFromUrl(entry.pendingInput.slot.previewUrl, entry.pendingInput.slot.sessionId)
    entry.frame.contentWindow?.postMessage(createGPreviewRenderMessage(target), "*")
  }, [])

  const clearPendingRenderRetries = React.useCallback((entry: StudioPreviewIframePoolEntry) => {
    for (const timer of entry.renderRetryTimers) window.clearTimeout(timer)
    entry.renderRetryTimers = []
  }, [])

  const schedulePendingRender = React.useCallback(
    (entry: StudioPreviewIframePoolEntry) => {
      clearPendingRenderRetries(entry)
      postPendingRender(entry)

      if (entry.ready) return

      entry.renderRetryTimers = studioPreviewIframePoolRenderRetryDelays.map((delay) =>
        window.setTimeout(() => postPendingRender(entry), delay),
      )
    },
    [clearPendingRenderRetries, postPendingRender],
  )

  const createEntry = React.useCallback((): StudioPreviewIframePoolEntry => {
    const frame = document.createElement("iframe")
    const entry: StudioPreviewIframePoolEntry = {
      frame,
      id: nextIdRef.current++,
      poolUrl: props.poolUrl,
      ready: false,
      renderRetryTimers: [],
    }

    createdCountRef.current += 1
    frame.setAttribute("aria-hidden", "true")
    frame.dataset.gtsxPooledPreviewFrame = "true"
    frame.loading = "eager"
    frame.tabIndex = -1
    frame.src = props.poolUrl
    Object.assign(frame.style, {
      background: "transparent",
      border: "0",
      height: "0",
      left: "0",
      pointerEvents: "none",
      position: "absolute",
      top: "0",
      width: "0",
      zIndex: "1",
    } satisfies Partial<CSSStyleDeclaration>)

    frame.addEventListener("load", () => schedulePendingRender(entry))
    entriesRef.current.push(entry)
    publishPoolStats()
    return entry
  }, [props.poolUrl, publishPoolStats, schedulePendingRender])

  const borrowEntry = React.useCallback((): { entry: StudioPreviewIframePoolEntry; origin: StudioPreviewIframeBorrowOrigin } => {
    const reusable = entriesRef.current.find((entry) => !entry.owner && entry.poolUrl === props.poolUrl)
    return reusable ? { entry: reusable, origin: "pool" } : { entry: createEntry(), origin: "new" }
  }, [createEntry, props.poolUrl])

  const pruneIdleFrames = React.useCallback(() => {
    const idleEntries = entriesRef.current.filter((entry) => !entry.owner)
    if (idleEntries.length <= maxIdleFrames) return

    const removable = new Set(idleEntries.slice(0, idleEntries.length - maxIdleFrames).map((entry) => entry.id))
    entriesRef.current = entriesRef.current.filter((entry) => {
      if (!removable.has(entry.id)) return true
      clearPendingRenderRetries(entry)
      entry.frame.remove()
      return false
    })
  }, [clearPendingRenderRetries, maxIdleFrames])

  const borrow = React.useCallback(
    (container: HTMLElement, input: StudioPreviewIframeBorrowInput): StudioPreviewIframeBorrowLease => {
      const { entry, origin } = borrowEntry()
      const owner = Symbol(input.slot.sessionId)
      borrowCountRef.current += 1
      if (origin === "new") {
        newBorrowCountRef.current += 1
      } else {
        reusedBorrowCountRef.current += 1
      }
      entry.owner = owner
      container.appendChild(entry.frame)
      applyBorrowInput(entry, input, schedulePendingRender)
      publishPoolStats()

      return {
        origin,
        update(nextInput) {
          if (entry.owner !== owner) return
          applyBorrowInput(entry, nextInput, schedulePendingRender)
        },
        release() {
          if (entry.owner !== owner) return

          clearPendingRenderRetries(entry)
          entry.pendingInput?.onPreviewFrameMount?.(entry.pendingInput.slot.sessionId, null)
          entry.owner = undefined
          entry.currentSessionId = undefined
          entry.pendingInput = undefined

          const host = hostRef.current
          if (host) host.appendChild(entry.frame)
          pruneIdleFrames()
          publishPoolStats()
        },
      }
    },
    [borrowEntry, clearPendingRenderRetries, pruneIdleFrames, publishPoolStats, schedulePendingRender],
  )

  React.useEffect(() => {
    if (!props.debug) return
    setPoolStats(
      snapshotStudioPreviewIframePoolStats(entriesRef.current, {
        borrows: borrowCountRef.current,
        created: createdCountRef.current,
        newBorrows: newBorrowCountRef.current,
        reusedBorrows: reusedBorrowCountRef.current,
      }),
    )
  }, [props.debug])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isStudioPreviewPoolReadyMessage(event.data)) return

      const entry = entriesRef.current.find((candidate) => candidate.frame.contentWindow === event.source)
      if (!entry) return

      entry.ready = true
      clearPendingRenderRetries(entry)
      postPendingRender(entry)
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [clearPendingRenderRetries, postPendingRender])

  React.useEffect(() => {
    return () => {
      for (const entry of entriesRef.current) {
        clearPendingRenderRetries(entry)
        entry.frame.remove()
      }
      if (poolStatsFrameRef.current) window.cancelAnimationFrame(poolStatsFrameRef.current)
      entriesRef.current = []
    }
  }, [clearPendingRenderRetries])

  const value = React.useMemo(() => ({ borrow }), [borrow])

  return (
    <StudioPreviewIframePoolContext.Provider value={value}>
      {props.children}
      <div
        aria-hidden="true"
        data-gtsx-preview-iframe-pool="true"
        ref={hostRef}
        style={{ height: 0, overflow: "hidden", position: "fixed", width: 0 }}
      />
      {props.debug ? <StudioPreviewIframePoolStatsPanel stats={poolStats} /> : null}
    </StudioPreviewIframePoolContext.Provider>
  )
}

export function StudioPooledPreviewIframe(props: StudioPooledPreviewIframeProps) {
  const pool = useStudioPreviewIframePool()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const leaseRef = React.useRef<StudioPreviewIframeBorrowLease | null>(null)
  const onPreviewFrameMountRef = React.useRef(props.onPreviewFrameMount)
  const onBorrowOriginChangeRef = React.useRef(props.onBorrowOriginChange)
  const borrowInput = React.useMemo<StudioPreviewIframeBorrowInput>(
    () => ({
      size: props.size,
      slot: props.slot,
      onPreviewFrameMount(sessionId, frame) {
        onPreviewFrameMountRef.current?.(sessionId, frame)
      },
    }),
    [props.size.height, props.size.width, props.slot.previewUrl, props.slot.sessionId, props.slot.title],
  )

  React.useEffect(() => {
    onPreviewFrameMountRef.current = props.onPreviewFrameMount
  }, [props.onPreviewFrameMount])

  React.useEffect(() => {
    onBorrowOriginChangeRef.current = props.onBorrowOriginChange
  }, [props.onBorrowOriginChange])

  React.useEffect(() => {
    leaseRef.current?.update(borrowInput)
  }, [borrowInput])

  React.useEffect(() => {
    if (!pool || !containerRef.current) return
    const lease = pool.borrow(containerRef.current, borrowInput)
    leaseRef.current = lease
    onBorrowOriginChangeRef.current?.(lease.origin)
    return () => {
      onBorrowOriginChangeRef.current?.(null)
      leaseRef.current = null
      lease.release()
    }
  }, [pool])

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

export function useStudioPreviewIframePool(): StudioPreviewIframePoolContextValue | null {
  return React.useContext(StudioPreviewIframePoolContext)
}

export function studioPreviewIframeBorrowKey(input: StudioPreviewIframeBorrowInput): string {
  return input.slot.sessionId
}

function cssSize(value: number | string): string {
  return typeof value === "number" ? `${value}px` : value
}

function applyBorrowInput(
  entry: StudioPreviewIframePoolEntry,
  input: StudioPreviewIframeBorrowInput,
  schedulePendingRender: (entry: StudioPreviewIframePoolEntry) => void,
) {
  const previousInput = entry.pendingInput
  const previousSessionId = previousInput?.slot.sessionId
  const nextSessionId = input.slot.sessionId

  entry.currentSessionId = nextSessionId
  entry.pendingInput = input
  entry.frame.title = input.slot.title
  entry.frame.style.height = cssSize(input.size.height)
  entry.frame.style.width = cssSize(input.size.width)

  if (previousSessionId !== nextSessionId) {
    if (previousSessionId) previousInput?.onPreviewFrameMount?.(previousSessionId, null)
    input.onPreviewFrameMount?.(nextSessionId, entry.frame)
  }

  schedulePendingRender(entry)
}

function isStudioPreviewPoolReadyMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "gtsx:pool-ready" &&
    (value as { protocolVersion?: unknown }).protocolVersion === 1
  )
}

function snapshotStudioPreviewIframePoolStats(
  entries: StudioPreviewIframePoolEntry[],
  counts: { borrows: number; created: number; newBorrows: number; reusedBorrows: number },
): StudioPreviewIframePoolStats {
  const active = entries.filter((entry) => entry.owner).length
  return {
    active,
    borrows: counts.borrows,
    created: counts.created,
    idle: entries.length - active,
    newBorrows: counts.newBorrows,
    reusedBorrows: counts.reusedBorrows,
    total: entries.length,
  }
}

function StudioPreviewIframePoolStatsPanel(props: { stats: StudioPreviewIframePoolStats }) {
  return (
    <div
      aria-label="Preview iframe pool stats"
      data-gtsx-preview-iframe-pool-stats="true"
      data-gtsx-preview-iframe-pool-active={props.stats.active}
      data-gtsx-preview-iframe-pool-borrows={props.stats.borrows}
      data-gtsx-preview-iframe-pool-created={props.stats.created}
      data-gtsx-preview-iframe-pool-idle={props.stats.idle}
      data-gtsx-preview-iframe-pool-new-borrows={props.stats.newBorrows}
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
      <span>created {props.stats.created}</span>
      <span>borrow {props.stats.borrows}</span>
      <span>new {props.stats.newBorrows}</span>
      <span>reuse {props.stats.reusedBorrows}</span>
    </div>
  )
}
