"use client"

import React from "react"
import {
  isGPreviewPoolReadyMessage,
  isGPreviewSessionMessage,
  type GPreviewSessionMessage,
} from "@runelight/core/preview-protocol"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  canvasViewportPresetForWorkspace,
  changeStudioCanvasViewportPreset,
  changeStudioRootProviderVariant,
  changeStudioViewportPreset,
  createStudioPreviewPoolUrl,
  createStudioWorkspaceStateFromUrl,
  currentStudioDesignPreviewTargets,
  currentStudioPreviewTargets,
  initialStudioUrlSearchParams,
  isStudioPreviewPoolDisabled,
  isStudioPreviewPoolDebugEnabled,
  isStudioPreviewQueueDebugEnabled,
  pushStudioWorkspaceUrlState,
  replaceStudioCanvasUrlState,
  selectStudioComponent,
  studioWorkspaceWithProviderVariantFilters,
  type StudioCanvasTransform,
  type StudioCanvasUrlScope,
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
import {
  defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
  defaultStudioPreviewRenderQueueMaximumMountedPreviewSessions,
  studioPreviewRenderQueueOptionsFromParams,
  type StudioPreviewRenderQueueOptions,
} from "../preview-render-queue"
import { StudioPreviewIframePoolProvider } from "../preview-iframe-pool"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { createStudioPreviewMessageFlush } from "../studio-preview-message-flush"
import { studioColors, studioFontFamily, studioRadii, studioShellStyle } from "../studio-theme"
import StudioDesignWorkspace from "./StudioDesignWorkspace.g"
import StudioWorkspaceView from "./StudioWorkspaceView.g"

export type StudioShellLoadedProps = {
  manifest: StudioManifest
  previewRenderQueue?: StudioPreviewRenderQueueOptions
  selection?: string
  urlSearch?: string
}

export type StudioShellDeferredProps = {
  manifest?: undefined
  manifestUrl?: string
  previewRenderQueue?: StudioPreviewRenderQueueOptions
  selection?: string
  urlSearch?: string
}

export type StudioShellProps = StudioShellLoadedProps | StudioShellDeferredProps

type StudioShellScope = {
  canvas: StudioCanvasTransform
  debugPreviewPool: boolean
  debugPreviewQueue: boolean
  disablePreviewPool: boolean
  onChangeCanvas: (canvas: StudioCanvasTransform) => void
  onChangeCanvasViewportPreset: (preset: StudioViewportPreset) => void
  onChangeRootProviderVariant: (providerName: string, variant: string | undefined) => void
  onChangeSelection: (selection: string) => void
  onChangeViewportPreset: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  onSelectComponent: (
    component: StudioManifestComponent,
    frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
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

type StudioShellView = "components" | "design"

const studioCanvasUrlCommitDelayMilliseconds = 120
const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

function useStudioShellScope(props: StudioShellLoadedProps, view: StudioShellView): StudioShellScope {
  const canvasUrlScope = studioCanvasUrlScopeForView(view)
  const initialUrlParams = React.useMemo(
    () => initialStudioUrlSearchParams(props.selection, props.urlSearch),
    [props.selection, props.urlSearch],
  )
  const initialUrlState = React.useMemo(
    () => createStudioWorkspaceStateFromUrl(props.manifest, initialUrlParams, { canvasScope: canvasUrlScope }),
    [canvasUrlScope, initialUrlParams, props.manifest],
  )
  const debugPreviewPool = React.useMemo(() => isStudioPreviewPoolDebugEnabled(initialUrlParams), [initialUrlParams])
  const debugPreviewQueue = React.useMemo(() => isStudioPreviewQueueDebugEnabled(initialUrlParams), [initialUrlParams])
  const disablePreviewPool = React.useMemo(() => isStudioPreviewPoolDisabled(initialUrlParams), [initialUrlParams])
  const previewRenderQueue = React.useMemo(
    () => ({ ...studioPreviewRenderQueueOptionsFromParams(initialUrlParams), ...props.previewRenderQueue }),
    [initialUrlParams, props.previewRenderQueue],
  )
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const canvasUrlState = useStudioCanvasUrlState(initialUrlState.canvas, canvasUrlScope)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const filteredWorkspace = React.useMemo(() => studioWorkspaceWithProviderVariantFilters(workspace), [workspace])
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const previewFrameMountedAt = React.useRef(new Map<string, number>())
  const currentTargets = React.useMemo(
    () =>
      view === "design"
        ? currentStudioDesignPreviewTargets(props.manifest, canvasViewportPresetForWorkspace(filteredWorkspace))
        : currentStudioPreviewTargets(props.manifest, filteredWorkspace),
    [props.manifest, filteredWorkspace, view],
  )
  const sessionIds = React.useMemo(() => new Set(currentTargets.map((target) => target.sessionId)), [currentTargets])
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
      const message = event.data as GPreviewSessionMessage
      if (!isGPreviewSessionMessage(message)) return

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
      const restoredView = studioShellViewFromLocation()
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search), {
        canvasScope: studioCanvasUrlScopeForView(restoredView),
      })
      canvasUrlState.restoreCanvasFromUrl(restored.canvas)
      setSelection(restored.selection)
      setUrlWarning(restored.warning)
      setWorkspace(restored.workspace)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [canvasUrlState.restoreCanvasFromUrl, props.manifest])

  useStudioLayoutEffect(() => {
    if (typeof window === "undefined") return

    canvasUrlState.flushPendingCanvasUrlCommit()
    const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search), {
      canvasScope: canvasUrlScope,
    })
    canvasUrlState.restoreCanvasFromUrl(restored.canvas)
  }, [canvasUrlScope, canvasUrlState.flushPendingCanvasUrlCommit, canvasUrlState.restoreCanvasFromUrl, props.manifest])

  const commitWorkspace = React.useCallback((updater: (current: StudioWorkspaceState) => StudioWorkspaceState) => {
    setWorkspace((current) => {
      const next = updater(current)
      pushStudioWorkspaceUrlState(selectionRef.current, next, {
        canvas: canvasUrlState.liveCanvasRef.current,
        canvasScope: canvasUrlScope,
      })
      return next
    })
  }, [canvasUrlScope, canvasUrlState.liveCanvasRef])

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
    onChangeRootProviderVariant(providerName, variant) {
      commitWorkspace((current) => changeStudioRootProviderVariant(current, providerName, variant))
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
        canvasScope: canvasUrlScope,
      })
    },
    onChangeViewportPreset(component, preset) {
      commitWorkspace((current) => changeStudioViewportPreset(current, component.coordinate, preset))
    },
    onPreviewFrameMount: handlePreviewFrameMount,
    onSelectComponent(component, frameStatesByName, options) {
      commitWorkspace((current) =>
        selectStudioComponent(
          current,
          props.manifest,
          component.coordinate,
          Object.values(frameStatesByName).flatMap((frameState) => (frameState?.tree ? [frameState.tree] : [])),
          options,
        ),
      )
    },
    previewCacheReady,
    previewGeometryStore: previewGeometryCacheStore,
    previewRenderQueue,
    selection,
    urlWarning,
    workspace: filteredWorkspace,
  }
}

type StudioCanvasUrlState = {
  commitLiveCanvasChange: (canvas: StudioCanvasTransform) => void
  flushPendingCanvasUrlCommit: () => void
  liveCanvasRef: React.MutableRefObject<StudioCanvasTransform>
  restoreCanvasFromUrl: (canvas: StudioCanvasTransform) => void
  restoredCanvas: StudioCanvasTransform
}

function useStudioCanvasUrlState(initialCanvas: StudioCanvasTransform, canvasUrlScope: StudioCanvasUrlScope): StudioCanvasUrlState {
  const [restoredCanvas, setRestoredCanvas] = React.useState(initialCanvas)
  const liveCanvasRef = React.useRef(restoredCanvas)
  const pendingCanvasUrlCommit = React.useRef<{ canvas: StudioCanvasTransform; canvasScope: StudioCanvasUrlScope } | null>(null)
  const pendingCanvasUrlCommitTimer = React.useRef(0)

  const clearPendingCanvasUrlCommit = React.useCallback(() => {
    pendingCanvasUrlCommit.current = null
    if (pendingCanvasUrlCommitTimer.current) {
      window.clearTimeout(pendingCanvasUrlCommitTimer.current)
      pendingCanvasUrlCommitTimer.current = 0
    }
  }, [])

  const flushPendingCanvasUrlCommit = React.useCallback(() => {
    if (pendingCanvasUrlCommitTimer.current) {
      window.clearTimeout(pendingCanvasUrlCommitTimer.current)
      pendingCanvasUrlCommitTimer.current = 0
    }

    pendingCanvasUrlCommitTimer.current = 0
    const nextCanvas = pendingCanvasUrlCommit.current
    if (!nextCanvas) return

    pendingCanvasUrlCommit.current = null
    replaceStudioCanvasUrlState(nextCanvas.canvas, { canvasScope: nextCanvas.canvasScope })
  }, [])

  const commitLiveCanvasChange = React.useCallback(
    (nextCanvas: StudioCanvasTransform) => {
      liveCanvasRef.current = nextCanvas
      pendingCanvasUrlCommit.current = { canvas: nextCanvas, canvasScope: canvasUrlScope }
      if (pendingCanvasUrlCommitTimer.current) window.clearTimeout(pendingCanvasUrlCommitTimer.current)
      pendingCanvasUrlCommitTimer.current = window.setTimeout(
        flushPendingCanvasUrlCommit,
        studioCanvasUrlCommitDelayMilliseconds,
      )
    },
    [canvasUrlScope, flushPendingCanvasUrlCommit],
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
      flushPendingCanvasUrlCommit,
      liveCanvasRef,
      restoreCanvasFromUrl,
      restoredCanvas,
    }),
    [commitLiveCanvasChange, flushPendingCanvasUrlCommit, restoreCanvasFromUrl, restoredCanvas],
  )
}

export default function StudioShell(props: StudioShellProps) {
  if (!props.manifest) return <StudioShellManifestLoader {...props} />

  return <StudioShellLoaded {...props} />
}

function StudioShellManifestLoader(props: StudioShellDeferredProps) {
  const manifestUrl = props.manifestUrl ?? "/runelight/studio/manifest"
  const initialUrlParams = React.useMemo(
    () => initialStudioUrlSearchParams(props.selection, props.urlSearch),
    [props.selection, props.urlSearch],
  )
  const shouldPrewarmPreviewPool = React.useMemo(() => !isStudioPreviewPoolDisabled(initialUrlParams), [initialUrlParams])
  const [manifest, setManifest] = React.useState<StudioManifest | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [previewPoolReady, setPreviewPoolReady] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    setError(null)
    setManifest(null)
    setPreviewPoolReady(false)

    fetch(manifestUrl, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Studio manifest request failed with ${response.status}.`)
        return (await response.json()) as StudioManifest
      })
      .then((nextManifest) => {
        if (controller.signal.aborted) return
        setManifest(nextManifest)
        setPreviewPoolReady(!shouldPrewarmPreviewPool)
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) return
        setError(nextError instanceof Error ? nextError.message : "Studio manifest request failed.")
      })

    return () => controller.abort()
  }, [manifestUrl, shouldPrewarmPreviewPool])

  if (manifest && previewPoolReady) {
    return (
      <StudioShellLoaded
        manifest={manifest}
        previewRenderQueue={props.previewRenderQueue}
        selection={props.selection}
        urlSearch={props.urlSearch}
      />
    )
  }

  return (
    <StudioShellLoadingFrame
      error={error}
      manifestUrl={manifestUrl}
      status={manifest && shouldPrewarmPreviewPool ? "Preparing preview host" : undefined}
    >
      {manifest && shouldPrewarmPreviewPool ? (
        <StudioShellPreviewPoolPrewarmer manifest={manifest} onReady={() => setPreviewPoolReady(true)} />
      ) : null}
    </StudioShellLoadingFrame>
  )
}

function StudioShellLoadingFrame(props: {
  children?: React.ReactNode
  error: string | null
  manifestUrl: string
  status?: string
}) {
  return (
    <main
      data-runelight-studio-shell-loading="true"
      style={{
        ...studioShellStyle(),
        alignItems: "center",
        display: "grid",
        height: "100vh",
        justifyItems: "center",
        overflow: "hidden",
      }}
    >
      <style>
        {`@keyframes runelight-studio-loading-bar {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(260%); }
}`}
      </style>
      <section
        aria-busy={props.error ? undefined : true}
        aria-live="polite"
        role="status"
        style={{
          display: "grid",
          gap: 10,
          width: "min(360px, calc(100vw - 48px))",
        }}
      >
        <strong
          style={{
            color: studioColors.text,
            fontFamily: studioFontFamily,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1.2,
          }}
        >
          {props.error ? "Studio manifest failed" : "Loading Studio"}
        </strong>
        <div
          aria-label="Studio manifest loading progress"
          role="progressbar"
          style={{
            background: studioColors.panelBorderSubtle,
            borderRadius: studioRadii.pill,
            height: 6,
            overflow: "hidden",
            width: "100%",
          }}
        >
          <span
            data-runelight-studio-shell-progress-bar="true"
            style={{
              animation: props.error ? undefined : "runelight-studio-loading-bar 1.15s ease-in-out infinite",
              background: props.error ? studioColors.error : studioColors.accent,
              borderRadius: studioRadii.pill,
              display: "block",
              height: "100%",
              transform: props.error ? "translateX(0)" : "translateX(-100%)",
              width: props.error ? "100%" : "32%",
            }}
          />
        </div>
        <span
          style={{
            color: props.error ? studioColors.errorText : studioColors.textMuted,
            fontFamily: studioFontFamily,
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {props.error ?? props.status ?? `Reading ${props.manifestUrl}`}
        </span>
        {props.children}
      </section>
    </main>
  )
}

function StudioShellPreviewPoolPrewarmer(props: {
  manifest: StudioManifest
  onReady: () => void
}) {
  const poolUrl = React.useMemo(() => createStudioPreviewPoolUrl(props.manifest), [props.manifest])
  const frameRef = React.useRef<HTMLIFrameElement | null>(null)
  const onReadyRef = React.useRef(props.onReady)
  onReadyRef.current = props.onReady

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      if (!isGPreviewPoolReadyMessage(event.data)) return
      onReadyRef.current()
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  return (
    <iframe
      aria-hidden="true"
      data-runelight-studio-preview-pool-prewarmer="true"
      ref={frameRef}
      src={poolUrl}
      style={{
        border: 0,
        height: 0,
        pointerEvents: "none",
        position: "absolute",
        visibility: "hidden",
        width: 0,
      }}
      tabIndex={-1}
      title="Preview host preloader"
    />
  )
}

function StudioShellLoaded(props: StudioShellLoadedProps) {
  const [view, setView] = useStudioShellView(props.urlSearch)
  const scope = useStudioShellScope(props, view)
  const canvasViewportPreset = canvasViewportPresetForWorkspace(scope.workspace)

  const studioContent =
    view === "design" ? (
      <StudioDesignWorkspace
        canvas={scope.canvas}
        debugPreviewPool={scope.debugPreviewPool}
        debugPreviewQueue={scope.debugPreviewQueue}
        manifest={props.manifest}
        onChangeCanvas={scope.onChangeCanvas}
        onChangeViewportPreset={scope.onChangeCanvasViewportPreset}
        onPreviewFrameMount={scope.onPreviewFrameMount}
        previewCacheReady={scope.previewCacheReady}
        previewGeometryStore={scope.previewGeometryStore}
        previewRenderQueue={scope.previewRenderQueue}
        viewportPreset={canvasViewportPreset}
      />
    ) : (
      <StudioWorkspaceView
        canvas={scope.canvas}
        debugPreviewPool={scope.debugPreviewPool}
        debugPreviewQueue={scope.debugPreviewQueue}
        manifest={props.manifest}
        onChangeCanvas={scope.onChangeCanvas}
        onChangeRootProviderVariant={scope.onChangeRootProviderVariant}
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
    )

  const studio = (
    <>
      <StudioShellModeTabs activeView={view} onChangeView={setView} />
      {studioContent}
    </>
  )

  if (scope.disablePreviewPool) return studio

  const maximumIdlePreviewFrames = studioPreviewIframePoolMaximumIdleFrames(scope.previewRenderQueue)
  const maximumRetainedPreviewFrames = studioPreviewIframePoolMaximumRetainedFrames(
    scope.previewRenderQueue,
    maximumIdlePreviewFrames,
  )

  return (
    <StudioPreviewIframePoolProvider
      debug={scope.debugPreviewPool}
      maximumIdleFrames={maximumIdlePreviewFrames}
      maximumRetainedFrames={maximumRetainedPreviewFrames}
      poolUrl={createStudioPreviewPoolUrl(props.manifest)}
    >
      {studio}
    </StudioPreviewIframePoolProvider>
  )
}

function useStudioShellView(urlSearch: string | undefined): [StudioShellView, (view: StudioShellView) => void] {
  const [view, setView] = React.useState<StudioShellView>(() => studioShellViewFromSearch(urlSearch))

  useStudioLayoutEffect(() => {
    if (typeof window === "undefined") return undefined

    const handleLocationChange = () => {
      setView(studioShellViewFromLocation())
    }

    handleLocationChange()
    window.addEventListener("hashchange", handleLocationChange)
    window.addEventListener("popstate", handleLocationChange)
    return () => {
      window.removeEventListener("hashchange", handleLocationChange)
      window.removeEventListener("popstate", handleLocationChange)
    }
  }, [])

  const changeView = React.useCallback((nextView: StudioShellView) => {
    setView(nextView)
    if (typeof window === "undefined") return

    const url = new URL(window.location.href)
    url.searchParams.delete("view")
    if (nextView === "design") {
      url.hash = "/drafts"
    } else {
      url.hash = "/frames"
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [])

  return [view, changeView]
}

function studioShellViewFromLocation(search: string | undefined = undefined, hash: string | undefined = undefined): StudioShellView {
  if (search === undefined && hash === undefined && typeof window === "undefined") return "components"

  const sourceHash = hash ?? (typeof window === "undefined" ? "" : window.location.hash)
  const hashView = studioShellViewFromHash(sourceHash)
  if (hashView) return hashView

  const source = search ?? (typeof window === "undefined" ? "" : window.location.search)
  const params = new URLSearchParams(source.startsWith("?") ? source.slice(1) : source)
  return studioShellViewFromRouteValue(params.get("view")) ?? "components"
}

function studioShellViewFromSearch(search: string | undefined): StudioShellView {
  if (search === undefined) return "components"

  const source = search.startsWith("?") ? search.slice(1) : search
  const params = new URLSearchParams(source)
  return studioShellViewFromRouteValue(params.get("view")) ?? "components"
}

function studioShellViewFromHash(hash: string): StudioShellView | undefined {
  const route = hash.startsWith("#") ? hash.slice(1) : hash
  return studioShellViewFromRouteValue(route.replace(/^\/+/, ""))
}

function studioShellViewFromRouteValue(value: string | null): StudioShellView | undefined {
  if (value === "drafts") return "design"
  if (value === "frames") return "components"
  return undefined
}

function studioCanvasUrlScopeForView(view: StudioShellView): StudioCanvasUrlScope {
  return view === "design" ? "design" : "components"
}

function StudioShellModeTabs(props: {
  activeView: StudioShellView
  onChangeView: (view: StudioShellView) => void
}) {
  return (
    <nav
      aria-label="Studio view"
      data-runelight-studio-mode-tabs="true"
      style={{
        alignItems: "center",
        background: "rgba(30,30,30,0.88)",
        border: `1px solid ${studioColors.panelBorder}`,
        borderRadius: studioRadii.md,
        boxShadow: "0 10px 28px rgba(0,0,0,0.2)",
        display: "flex",
        left: 16,
        overflow: "hidden",
        position: "fixed",
        top: 12,
        zIndex: 25,
      }}
    >
      <StudioShellModeTab
        active={props.activeView === "components"}
        label="frames"
        onClick={() => props.onChangeView("components")}
      />
      <StudioShellModeTab
        active={props.activeView === "design"}
        label="drafts"
        onClick={() => props.onChangeView("design")}
      />
    </nav>
  )
}

function StudioShellModeTab(props: {
  active: boolean
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      aria-pressed={props.active}
      onClick={props.onClick}
      style={{
        appearance: "none",
        background: props.active ? studioColors.panelBgElevated : "transparent",
        border: 0,
        borderBottom: `2px solid ${props.active ? studioColors.accent : "transparent"}`,
        color: props.active ? studioColors.text : studioColors.textMuted,
        cursor: "pointer",
        fontFamily: studioFontFamily,
        fontSize: 10,
        lineHeight: 1,
        minWidth: 82,
        padding: "9px 10px 8px",
      }}
      title={props.title ?? props.label}
      type="button"
    >
      {props.label}
    </button>
  )
}

function studioPreviewIframePoolMaximumIdleFrames(options: StudioPreviewRenderQueueOptions): number {
  const maximumMountedPreviewSessions = positiveStudioShellIntegerOption(
    options.maximumMountedPreviewSessions,
    defaultStudioPreviewRenderQueueMaximumMountedPreviewSessions,
  )
  const movementRenderTasks = positiveStudioShellIntegerOption(
    options.maximumConcurrentRenderTasksDuringCanvasMovement,
    defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
  )
  return Math.min(maximumMountedPreviewSessions, movementRenderTasks * 2)
}

function studioPreviewIframePoolMaximumRetainedFrames(
  options: StudioPreviewRenderQueueOptions,
  maximumIdleFrames: number,
): number {
  const maximumMountedPreviewSessions = positiveStudioShellIntegerOption(
    options.maximumMountedPreviewSessions,
    defaultStudioPreviewRenderQueueMaximumMountedPreviewSessions,
  )
  return maximumMountedPreviewSessions + maximumIdleFrames
}

function positiveStudioShellIntegerOption(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : fallback
}

function shouldHydrateStudioPreviewCacheBeforeLayout(manifest: StudioManifest): boolean {
  return Boolean(manifest.cache?.namespace) || typeof window !== "undefined"
}

function dispatchStudioPreviewTiming(
  target: StudioPreviewTarget,
  message: GPreviewSessionMessage,
  mountedAt: number | undefined,
) {
  if (message.type !== "runelight:ready" && message.type !== "runelight:error") return

  window.dispatchEvent(
    new CustomEvent("runelight:preview-timing", {
      detail: {
        cacheKey: target.cacheKey,
        sessionId: message.sessionId,
        type: message.type,
        ...(typeof mountedAt === "number" ? { elapsedMs: Math.round((performance.now() - mountedAt) * 10) / 10 } : {}),
      },
    }),
  )
}
