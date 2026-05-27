"use client"

import React from "react"
import type { GPreviewProtocolMessage } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  canvasViewportPresetForWorkspace,
  changeStudioCanvasViewportPreset,
  changeStudioViewportPreset,
  createStudioPreviewPoolUrl,
  createStudioWorkspaceStateFromUrl,
  currentStudioPreviewTargets,
  currentPreviewSessionIds,
  initialStudioUrlSearchParams,
  isGPreviewProtocolMessage,
  isStudioPreviewPoolDisabled,
  isStudioPreviewPoolDebugEnabled,
  pushStudioWorkspaceUrlState,
  replaceStudioCanvasUrlState,
  selectStudioComponent,
  studioPreviewWarmupTargets,
  type StudioCanvasTransform,
  type StudioComponentSelectionOptions,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioPreviewWarmupTarget,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import {
  readStudioPreviewIndexedDBCache,
  studioPreviewIndexedDBNamespace,
  writeStudioPreviewIndexedDBCache,
} from "../preview-cache-indexeddb"
import { StudioPreviewIframePoolProvider } from "../preview-iframe-pool"
import StudioPreviewIframe from "./StudioPreviewIframe"
import StudioWorkspaceView from "./StudioWorkspaceView.g"

export type StudioShellProps = {
  manifest: StudioManifest
  selection?: string
  urlSearch?: string
}

type StudioShellScope = {
  canvas: StudioCanvasTransform
  debugPreviewPool: boolean
  disablePreviewPool: boolean
  frameStates: Record<string, StudioPreviewFrameState>
  onChangeCanvas: (canvas: StudioCanvasTransform) => void
  onChangeCanvasViewportPreset: (preset: StudioViewportPreset) => void
  onChangeSelection: (selection: string) => void
  onChangeViewportPreset: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelectComponent: (
    component: StudioManifestComponent,
    caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
    options?: StudioComponentSelectionOptions,
  ) => void
  previewCache: Record<string, StudioPreviewCacheEntry>
  previewCacheReady: boolean
  selection: string
  urlWarning?: string
  warmupTargets: StudioPreviewWarmupTarget[]
  workspace: StudioWorkspaceState
}

const studioPreviewWarmupLimit = 2
const studioCanvasCommitDelayMs = 120
const studioPreviewCacheLimit = 96

function useStudioShellScope(props: StudioShellProps): StudioShellScope {
  const initialUrlParams = React.useMemo(
    () => initialStudioUrlSearchParams(props.selection, props.urlSearch),
    [props.selection, props.urlSearch],
  )
  const initialUrlState = React.useMemo(
    () => createStudioWorkspaceStateFromUrl(props.manifest, initialUrlParams),
    [initialUrlParams, props.manifest],
  )
  const debugPreviewPool = React.useMemo(() => isStudioPreviewPoolDebugEnabled(initialUrlParams), [initialUrlParams])
  const disablePreviewPool = React.useMemo(() => isStudioPreviewPoolDisabled(initialUrlParams), [initialUrlParams])
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const [canvas, setCanvas] = React.useState(initialUrlState.canvas)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const [frameStates, setFrameStates] = React.useState<Record<string, StudioPreviewFrameState>>({})
  const [previewCache, setPreviewCache] = React.useState<Record<string, StudioPreviewCacheEntry>>({})
  const [warmupsEnabled, setWarmupsEnabled] = React.useState(false)
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const previewFrameMountedAt = React.useRef(new Map<string, number>())
  const pendingCanvasCommit = React.useRef<StudioCanvasTransform | null>(null)
  const pendingCanvasCommitTimer = React.useRef(0)
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])
  const currentTargets = React.useMemo(() => currentStudioPreviewTargets(props.manifest, workspace), [props.manifest, workspace])
  const currentTargetCacheKey = React.useMemo(
    () => currentTargets.map((target) => target.cacheKey).join("\n"),
    [currentTargets],
  )
  const previewCacheNamespace = React.useMemo(() => studioPreviewIndexedDBNamespace(props.manifest), [props.manifest])
  const shouldHydratePreviewCacheBeforeLayout = Boolean(props.manifest.cache?.namespace)
  const [previewCacheReadyState, setPreviewCacheReadyState] = React.useState(() => ({
    key: currentTargetCacheKey,
    ready: !shouldHydratePreviewCacheBeforeLayout,
  }))
  const previewCacheReady =
    !shouldHydratePreviewCacheBeforeLayout ||
    (previewCacheReadyState.key === currentTargetCacheKey && previewCacheReadyState.ready)
  const warmupTargets = React.useMemo(
    () => (warmupsEnabled ? studioPreviewWarmupTargets(props.manifest, workspace, { limit: studioPreviewWarmupLimit }) : []),
    [props.manifest, warmupsEnabled, workspace],
  )
  const targetsBySessionId = React.useMemo(
    () => new Map([...currentTargets, ...warmupTargets].map((target) => [target.sessionId, target] as const)),
    [currentTargets, warmupTargets],
  )
  const canvasRef = React.useRef(canvas)
  const previewCacheRef = React.useRef(previewCache)
  const selectionRef = React.useRef(selection)

  React.useEffect(() => {
    setWarmupsEnabled(false)
    return scheduleStudioPreviewWarmups(() => setWarmupsEnabled(true))
  }, [workspace])

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  React.useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

  React.useEffect(() => {
    previewCacheRef.current = previewCache
  }, [previewCache])

  React.useEffect(() => {
    setFrameStates({})
    previewCacheRef.current = {}
    setPreviewCache({})
  }, [props.manifest])

  React.useEffect(() => {
    let cancelled = false
    const cacheKeys = [...new Set(currentTargets.map((target) => target.cacheKey))]
    const readKey = currentTargetCacheKey

    if (shouldHydratePreviewCacheBeforeLayout) {
      setPreviewCacheReadyState({ key: readKey, ready: cacheKeys.length === 0 })
    }

    readStudioPreviewIndexedDBCache(previewCacheNamespace, cacheKeys).then((cachedEntries) => {
      if (cancelled) return

      if (Object.keys(cachedEntries).length > 0) {
        setPreviewCache((current) => {
          const next = pruneStudioPreviewCache({ ...cachedEntries, ...current })
          previewCacheRef.current = next
          return next
        })
      }
      if (shouldHydratePreviewCacheBeforeLayout) setPreviewCacheReadyState({ key: readKey, ready: true })
    })

    return () => {
      cancelled = true
    }
  }, [currentTargetCacheKey, currentTargets, previewCacheNamespace, shouldHydratePreviewCacheBeforeLayout])

  React.useEffect(() => {
    return () => {
      if (pendingCanvasCommitTimer.current) window.clearTimeout(pendingCanvasCommitTimer.current)
    }
  }, [])

  React.useEffect(() => {
    type PendingPreviewMessage = {
      message: GPreviewProtocolMessage
      target: StudioPreviewWarmupTarget
    }

    let pendingMessages: PendingPreviewMessage[] = []
    let scheduledFrame = 0

    const flushPreviewMessages = () => {
      scheduledFrame = 0
      const messages = pendingMessages
      pendingMessages = []
      if (messages.length === 0) return

      React.startTransition(() => {
        setFrameStates((current) =>
          messages.reduce(
            (nextFrameStates, pending) =>
              applyStudioPreviewMessageToFrameStates(nextFrameStates, pending.message, sessionIds),
            current,
          ),
        )
        const nextPreviewCache = pruneStudioPreviewCache(applyStudioPreviewMessagesToCache(previewCacheRef.current, messages))
        previewCacheRef.current = nextPreviewCache
        setPreviewCache(nextPreviewCache)
        void writeStudioPreviewIndexedDBCache(previewCacheNamespace, previewCacheEntriesForMessages(nextPreviewCache, messages))
      })
    }

    const schedulePreviewMessageFlush = () => {
      if (scheduledFrame) return
      scheduledFrame = window.requestAnimationFrame(flushPreviewMessages)
    }

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message)) return

      const target = targetsBySessionId.get(message.sessionId)
      if (!target) return

      dispatchStudioPreviewTiming(target, message, previewFrameMountedAt.current.get(message.sessionId))
      pendingMessages.push({ message, target })
      schedulePreviewMessageFlush()
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  }, [previewCacheNamespace, sessionIds, targetsBySessionId])

  const clearPendingCanvasCommit = React.useCallback(() => {
    pendingCanvasCommit.current = null
    if (pendingCanvasCommitTimer.current) {
      window.clearTimeout(pendingCanvasCommitTimer.current)
      pendingCanvasCommitTimer.current = 0
    }
  }, [])

  React.useEffect(() => {
    const handlePopState = () => {
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search))
      clearPendingCanvasCommit()
      canvasRef.current = restored.canvas
      setSelection(restored.selection)
      setCanvas(restored.canvas)
      setUrlWarning(restored.warning)
      setWorkspace(restored.workspace)
      setFrameStates({})
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [clearPendingCanvasCommit, props.manifest])

  const commitWorkspace = React.useCallback((updater: (current: StudioWorkspaceState) => StudioWorkspaceState) => {
    setWorkspace((current) => {
      const next = updater(current)
      pushStudioWorkspaceUrlState(selectionRef.current, next, { canvas: canvasRef.current })
      return next
    })
  }, [])

  const flushCanvasCommit = React.useCallback(() => {
    pendingCanvasCommitTimer.current = 0
    const nextCanvas = pendingCanvasCommit.current
    if (!nextCanvas) return
    pendingCanvasCommit.current = null
    setCanvas(nextCanvas)
    replaceStudioCanvasUrlState(nextCanvas)
  }, [])

  const commitCanvas = React.useCallback((nextCanvas: StudioCanvasTransform) => {
    canvasRef.current = nextCanvas
    pendingCanvasCommit.current = nextCanvas
    if (pendingCanvasCommitTimer.current) window.clearTimeout(pendingCanvasCommitTimer.current)
    pendingCanvasCommitTimer.current = window.setTimeout(flushCanvasCommit, studioCanvasCommitDelayMs)
  }, [flushCanvasCommit])

  return {
    canvas,
    debugPreviewPool,
    disablePreviewPool,
    frameStates,
    onChangeCanvas: commitCanvas,
    onChangeCanvasViewportPreset(preset) {
      commitWorkspace((current) => changeStudioCanvasViewportPreset(current, preset))
    },
    onChangeSelection(nextSelection) {
      const params = new URLSearchParams()
      params.set("selection", nextSelection)
      const canvasViewportPreset = canvasViewportPresetForWorkspace(workspace)
      if (canvasViewportPreset !== "tablet") params.set("canvasViewport", canvasViewportPreset)
      const nextUrlState = createStudioWorkspaceStateFromUrl(props.manifest, params)
      selectionRef.current = nextUrlState.selection
      setSelection(nextUrlState.selection)
      setUrlWarning(nextUrlState.warning)
      setWorkspace(nextUrlState.workspace)
      setFrameStates({})
      pushStudioWorkspaceUrlState(nextUrlState.selection, nextUrlState.workspace, { canvas: canvasRef.current })
    },
    onChangeViewportPreset(component, preset) {
      commitWorkspace((current) => changeStudioViewportPreset(current, component.coordinate, preset))
    },
    onPreviewFrameMount(sessionId, frame) {
      if (frame) {
        previewFrames.current.set(sessionId, frame)
        previewFrameMountedAt.current.set(sessionId, performance.now())
      } else {
        previewFrames.current.delete(sessionId)
        previewFrameMountedAt.current.delete(sessionId)
      }
    },
    onSelectComponent(component, caseFrameStates, options) {
      commitWorkspace((current) =>
        selectStudioComponent(
          current,
          props.manifest,
          component.coordinate,
          Object.values(caseFrameStates).flatMap((frameState) => (frameState?.tree ? [frameState.tree] : [])),
          options,
        ),
      )
    },
    previewCache,
    previewCacheReady,
    selection,
    urlWarning,
    warmupTargets,
    workspace,
  }
}

export default function StudioShell(props: StudioShellProps) {
  const scope = useStudioShellScope(props)

  const studio = (
    <>
      <StudioWorkspaceView
        canvas={scope.canvas}
        debugPreviewPool={scope.debugPreviewPool}
        frameStates={scope.frameStates}
        manifest={props.manifest}
        onChangeCanvas={scope.onChangeCanvas}
        onSelectComponent={scope.onSelectComponent}
        onChangeCanvasViewportPreset={scope.onChangeCanvasViewportPreset}
        onChangeSelection={scope.onChangeSelection}
        onChangeViewportPreset={scope.onChangeViewportPreset}
        onPreviewFrameMount={scope.onPreviewFrameMount}
        previewCache={scope.previewCache}
        previewCacheReady={scope.previewCacheReady}
        selection={scope.selection}
        urlWarning={scope.urlWarning}
        workspace={scope.workspace}
      />
      <StudioPreviewWarmups targets={scope.warmupTargets} />
    </>
  )

  if (scope.disablePreviewPool) return studio

  return (
    <StudioPreviewIframePoolProvider debug={scope.debugPreviewPool} poolUrl={createStudioPreviewPoolUrl(props.manifest)}>
      {studio}
    </StudioPreviewIframePoolProvider>
  )
}

function StudioPreviewWarmups(props: { targets: StudioPreviewWarmupTarget[] }) {
  if (props.targets.length === 0) return null

  return (
    <div aria-hidden="true" data-gtsx-preview-warmups="true" style={{ height: 0, overflow: "hidden", position: "fixed", width: 0 }}>
      {props.targets.map((target) => (
        <div key={target.cacheKey} style={{ height: 0, overflow: "hidden", position: "relative", width: 0 }}>
          <StudioPreviewIframe
            size={target.size}
            slot={{
              previewUrl: target.previewUrl,
              sessionId: target.sessionId,
              title: target.title,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function applyStudioPreviewMessagesToCache(
  current: Record<string, StudioPreviewCacheEntry>,
  messages: { message: GPreviewProtocolMessage; target: StudioPreviewWarmupTarget }[],
): Record<string, StudioPreviewCacheEntry> {
  const now = Date.now()
  let next = current

  for (const { message, target } of messages) {
    const currentEntry = next[target.cacheKey]
    const currentFrameState = currentEntry?.frameState ?? {
      expectedSessionId: message.sessionId,
      ready: false,
    }
    if (next === current) next = { ...current }
    next[target.cacheKey] = {
      frameState: applyStudioPreviewMessage(currentFrameState, message),
      lastUsedAt: now,
    }
  }

  return next
}

function previewCacheEntriesForMessages(
  cache: Record<string, StudioPreviewCacheEntry>,
  messages: { target: StudioPreviewWarmupTarget }[],
): Record<string, StudioPreviewCacheEntry | undefined> {
  const entries: Record<string, StudioPreviewCacheEntry | undefined> = {}
  for (const { target } of messages) entries[target.cacheKey] = cache[target.cacheKey]
  return entries
}

function pruneStudioPreviewCache(
  cache: Record<string, StudioPreviewCacheEntry>,
): Record<string, StudioPreviewCacheEntry> {
  const entries = Object.entries(cache)
  if (entries.length <= studioPreviewCacheLimit) return cache

  return Object.fromEntries(
    entries
      .sort((left, right) => right[1].lastUsedAt - left[1].lastUsedAt)
      .slice(0, studioPreviewCacheLimit),
  )
}

function scheduleStudioPreviewWarmups(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}

  const idleWindow = window as typeof window & {
    cancelIdleCallback?: (handle: number) => void
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }

  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 1500 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = window.setTimeout(callback, 600)
  return () => window.clearTimeout(handle)
}

function dispatchStudioPreviewTiming(
  target: StudioPreviewWarmupTarget,
  message: GPreviewProtocolMessage,
  mountedAt: number | undefined,
) {
  if (message.type !== "gtsx:ready" && message.type !== "gtsx:error") return

  window.dispatchEvent(
    new CustomEvent("gtsx:preview-timing", {
      detail: {
        cacheKey: target.cacheKey,
        sessionId: message.sessionId,
        type: message.type,
        ...(typeof mountedAt === "number" ? { elapsedMs: Math.round((performance.now() - mountedAt) * 10) / 10 } : {}),
      },
    }),
  )
}
