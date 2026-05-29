"use client"

import React from "react"
import type { GPreviewProtocolMessage } from "@gtsx/core"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
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
  isStudioPreviewQueueDebugEnabled,
  pushStudioWorkspaceUrlState,
  replaceStudioCanvasUrlState,
  selectStudioComponent,
  type StudioCanvasTransform,
  type StudioComponentSelectionOptions,
  type StudioPreviewFrameState,
  type StudioPreviewTarget,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import { studioPreviewIndexedDBNamespace } from "../preview-cache-indexeddb"
import {
  createStudioPreviewGeometryCacheStore,
  studioPreviewGeometryCacheKeys,
  type StudioPreviewGeometryCacheMessage,
  type StudioPreviewGeometryCacheStore,
} from "../preview-geometry-cache-store"
import { studioPreviewRenderQueueOptionsFromParams, type StudioPreviewRenderQueueOptions } from "../preview-render-queue"
import { StudioPreviewIframePoolProvider } from "../preview-iframe-pool"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { createStudioPreviewMessageFlush } from "../studio-preview-message-flush"
import StudioWorkspaceView from "./StudioWorkspaceView.g"

export type StudioShellProps = {
  manifest: StudioManifest
  previewRenderQueue?: StudioPreviewRenderQueueOptions
  selection?: string
  urlSearch?: string
}

type StudioShellScope = {
  canvas: StudioCanvasTransform
  debugPreviewPool: boolean
  debugPreviewQueue: boolean
  disablePreviewPool: boolean
  onChangeCanvas: (canvas: StudioCanvasTransform) => void
  onChangeCanvasViewportPreset: (preset: StudioViewportPreset) => void
  onChangeSelection: (selection: string) => void
  onChangeViewportPreset: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  onSelectComponent: (
    component: StudioManifestComponent,
    caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
    options?: StudioComponentSelectionOptions,
  ) => void
  previewCacheReady: boolean
  previewGeometryStore: StudioPreviewGeometryCacheStore
  previewRenderQueue: StudioPreviewRenderQueueOptions
  selection: string
  urlWarning?: string
  workspace: StudioWorkspaceState
}

type PendingStudioPreviewMessage = StudioPreviewGeometryCacheMessage & {
  mountedAt?: number
  target: StudioPreviewTarget
}

const studioCanvasUrlCommitDelayMilliseconds = 120
const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

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
  const debugPreviewQueue = React.useMemo(() => isStudioPreviewQueueDebugEnabled(initialUrlParams), [initialUrlParams])
  const disablePreviewPool = React.useMemo(() => isStudioPreviewPoolDisabled(initialUrlParams), [initialUrlParams])
  const previewRenderQueue = React.useMemo(
    () => ({ ...studioPreviewRenderQueueOptionsFromParams(initialUrlParams), ...props.previewRenderQueue }),
    [initialUrlParams, props.previewRenderQueue],
  )
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const canvasUrlState = useStudioCanvasUrlState(initialUrlState.canvas)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const previewFrameMountedAt = React.useRef(new Map<string, number>())
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])
  const currentTargets = React.useMemo(() => currentStudioPreviewTargets(props.manifest, workspace), [props.manifest, workspace])
  const previewCacheNamespace = React.useMemo(() => studioPreviewIndexedDBNamespace(props.manifest), [props.manifest])
  const previewGeometryCacheKeys = React.useMemo(() => studioPreviewGeometryCacheKeys(props.manifest), [props.manifest])
  const previewGeometryCacheStore = React.useMemo(
    () => createStudioPreviewGeometryCacheStore({ cacheKeys: previewGeometryCacheKeys, namespace: previewCacheNamespace }),
    [previewCacheNamespace, previewGeometryCacheKeys],
  )
  const shouldHydratePreviewCacheBeforeLayout = shouldHydrateStudioPreviewCacheBeforeLayout(props.manifest)
  const [previewCacheReady, setPreviewCacheReady] = React.useState(true)
  const targetsBySessionId = React.useMemo(
    () => new Map(currentTargets.map((target) => [target.sessionId, target] as const)),
    [currentTargets],
  )
  const selectionRef = React.useRef(selection)

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  React.useEffect(() => {
    previewGeometryCacheStore.reset()
  }, [previewGeometryCacheStore])

  useStudioLayoutEffect(() => {
    let cancelled = false

    if (shouldHydratePreviewCacheBeforeLayout) {
      setPreviewCacheReady(previewGeometryCacheStore.cacheKeys.length === 0)
    } else {
      setPreviewCacheReady(true)
    }

    previewGeometryCacheStore.hydrate().then(() => {
      if (cancelled) return

      if (shouldHydratePreviewCacheBeforeLayout) setPreviewCacheReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [previewGeometryCacheStore, shouldHydratePreviewCacheBeforeLayout])

  React.useEffect(() => {
    let pendingMessages: PendingStudioPreviewMessage[] = []
    let scheduledFrame = 0

    const flushPreviewMessages = () => {
      scheduledFrame = 0
      const messages = pendingMessages
      pendingMessages = []
      if (messages.length === 0) return

      React.startTransition(() => {
        const messageFlush = createStudioPreviewMessageFlush({
          getFrameState: previewGeometryCacheStore.getFrameState,
          messages,
        })
        if (messageFlush.messagesToApply.length === 0) return

        const previewCacheUpdate = previewGeometryCacheStore.putMessages(messageFlush.messagesToApply, sessionIds)
        for (const pending of messageFlush.completionMessages) {
          dispatchStudioPreviewTiming(pending.target, pending.message, pending.mountedAt)
        }
        if (!previewCacheUpdate.changed) return
        void previewGeometryCacheStore.writeEntries(previewCacheUpdate.entriesToWrite)
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

      pendingMessages.push({ message, mountedAt: previewFrameMountedAt.current.get(message.sessionId), target })
      schedulePreviewMessageFlush()
    }

    window.addEventListener("message", handleMessage)
    return () => {
      window.removeEventListener("message", handleMessage)
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  }, [previewGeometryCacheStore, sessionIds, targetsBySessionId])

  React.useEffect(() => {
    const handlePopState = () => {
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search))
      canvasUrlState.restoreCanvasFromUrl(restored.canvas)
      setSelection(restored.selection)
      setUrlWarning(restored.warning)
      setWorkspace(restored.workspace)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [canvasUrlState, props.manifest])

  const commitWorkspace = React.useCallback((updater: (current: StudioWorkspaceState) => StudioWorkspaceState) => {
    setWorkspace((current) => {
      const next = updater(current)
      pushStudioWorkspaceUrlState(selectionRef.current, next, { canvas: canvasUrlState.liveCanvasRef.current })
      return next
    })
  }, [canvasUrlState.liveCanvasRef])

  const handlePreviewFrameMount = React.useCallback((sessionId: string, frame: HTMLIFrameElement | null, state?: StudioPreviewIframeMountState) => {
    if (frame) {
      previewFrames.current.set(sessionId, frame)
      previewFrameMountedAt.current.set(sessionId, performance.now())
      if (!state?.retainedRender) previewGeometryCacheStore.markSessionRenderStarted(sessionId)
    } else {
      previewFrames.current.delete(sessionId)
      previewFrameMountedAt.current.delete(sessionId)
    }
  }, [previewGeometryCacheStore])

  return {
    canvas: canvasUrlState.restoredCanvas,
    debugPreviewPool,
    debugPreviewQueue,
    disablePreviewPool,
    onChangeCanvas: canvasUrlState.commitLiveCanvasChange,
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
      pushStudioWorkspaceUrlState(nextUrlState.selection, nextUrlState.workspace, {
        canvas: canvasUrlState.liveCanvasRef.current,
      })
    },
    onChangeViewportPreset(component, preset) {
      commitWorkspace((current) => changeStudioViewportPreset(current, component.coordinate, preset))
    },
    onPreviewFrameMount: handlePreviewFrameMount,
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
    previewCacheReady,
    previewGeometryStore: previewGeometryCacheStore,
    previewRenderQueue,
    selection,
    urlWarning,
    workspace,
  }
}

type StudioCanvasUrlState = {
  commitLiveCanvasChange: (canvas: StudioCanvasTransform) => void
  liveCanvasRef: React.MutableRefObject<StudioCanvasTransform>
  restoreCanvasFromUrl: (canvas: StudioCanvasTransform) => void
  restoredCanvas: StudioCanvasTransform
}

function useStudioCanvasUrlState(initialCanvas: StudioCanvasTransform): StudioCanvasUrlState {
  const [restoredCanvas, setRestoredCanvas] = React.useState(initialCanvas)
  const liveCanvasRef = React.useRef(restoredCanvas)
  const pendingCanvasUrlCommit = React.useRef<StudioCanvasTransform | null>(null)
  const pendingCanvasUrlCommitTimer = React.useRef(0)

  const clearPendingCanvasUrlCommit = React.useCallback(() => {
    pendingCanvasUrlCommit.current = null
    if (pendingCanvasUrlCommitTimer.current) {
      window.clearTimeout(pendingCanvasUrlCommitTimer.current)
      pendingCanvasUrlCommitTimer.current = 0
    }
  }, [])

  const flushCanvasUrlCommit = React.useCallback(() => {
    pendingCanvasUrlCommitTimer.current = 0
    const nextCanvas = pendingCanvasUrlCommit.current
    if (!nextCanvas) return

    pendingCanvasUrlCommit.current = null
    replaceStudioCanvasUrlState(nextCanvas)
  }, [])

  const commitLiveCanvasChange = React.useCallback(
    (nextCanvas: StudioCanvasTransform) => {
      liveCanvasRef.current = nextCanvas
      pendingCanvasUrlCommit.current = nextCanvas
      if (pendingCanvasUrlCommitTimer.current) window.clearTimeout(pendingCanvasUrlCommitTimer.current)
      pendingCanvasUrlCommitTimer.current = window.setTimeout(
        flushCanvasUrlCommit,
        studioCanvasUrlCommitDelayMilliseconds,
      )
    },
    [flushCanvasUrlCommit],
  )

  const restoreCanvasFromUrl = React.useCallback(
    (nextCanvas: StudioCanvasTransform) => {
      clearPendingCanvasUrlCommit()
      liveCanvasRef.current = nextCanvas
      setRestoredCanvas(nextCanvas)
    },
    [clearPendingCanvasUrlCommit],
  )

  React.useEffect(() => {
    return () => clearPendingCanvasUrlCommit()
  }, [clearPendingCanvasUrlCommit])

  return React.useMemo(
    () => ({
      commitLiveCanvasChange,
      liveCanvasRef,
      restoreCanvasFromUrl,
      restoredCanvas,
    }),
    [commitLiveCanvasChange, restoreCanvasFromUrl, restoredCanvas],
  )
}

export default function StudioShell(props: StudioShellProps) {
  const scope = useStudioShellScope(props)

  const studio = (
    <>
      <StudioWorkspaceView
        canvas={scope.canvas}
        debugPreviewPool={scope.debugPreviewPool}
        debugPreviewQueue={scope.debugPreviewQueue}
        manifest={props.manifest}
        onChangeCanvas={scope.onChangeCanvas}
        onSelectComponent={scope.onSelectComponent}
        onChangeCanvasViewportPreset={scope.onChangeCanvasViewportPreset}
        onChangeSelection={scope.onChangeSelection}
        onChangeViewportPreset={scope.onChangeViewportPreset}
        onPreviewFrameMount={scope.onPreviewFrameMount}
        previewCacheReady={scope.previewCacheReady}
        previewGeometryStore={scope.previewGeometryStore}
        previewRenderQueue={scope.previewRenderQueue}
        selection={scope.selection}
        urlWarning={scope.urlWarning}
        workspace={scope.workspace}
      />
    </>
  )

  if (scope.disablePreviewPool) return studio

  return (
    <StudioPreviewIframePoolProvider debug={scope.debugPreviewPool} poolUrl={createStudioPreviewPoolUrl(props.manifest)}>
      {studio}
    </StudioPreviewIframePoolProvider>
  )
}

function shouldHydrateStudioPreviewCacheBeforeLayout(manifest: StudioManifest): boolean {
  return Boolean(manifest.cache?.namespace) || typeof window !== "undefined"
}

function dispatchStudioPreviewTiming(
  target: StudioPreviewTarget,
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
