"use client"

import React from "react"
import type { GPreviewProtocolMessage } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioPreviewMessage,
  applyStudioPreviewMessageToFrameStates,
  canvasViewportPresetForWorkspace,
  changeStudioCanvasViewportPreset,
  changeStudioComponentCase,
  changeStudioViewportPreset,
  createStudioWorkspaceStateFromUrl,
  currentStudioPreviewTargets,
  currentPreviewSessionIds,
  initialStudioUrlSearchParams,
  isGPreviewProtocolMessage,
  pushStudioWorkspaceUrlState,
  replaceStudioCanvasUrlState,
  selectStudioComponent,
  studioPreviewWarmupTargets,
  type StudioCanvasTransform,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioPreviewWarmupTarget,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import BufferedPreviewIframe from "./BufferedPreviewIframe.g"
import StudioWorkspaceView from "./StudioWorkspaceView.g"

export type StudioShellProps = {
  manifest: StudioManifest
  selection?: string
  urlSearch?: string
}

type StudioShellScope = {
  canvas: StudioCanvasTransform
  frameStates: Record<string, StudioPreviewFrameState>
  onChangeCanvas: (canvas: StudioCanvasTransform) => void
  onChangeCanvasViewportPreset: (preset: StudioViewportPreset) => void
  onChangeCase: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  onChangeSelection: (selection: string) => void
  onChangeViewportPreset: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelectComponent: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  previewCache: Record<string, StudioPreviewCacheEntry>
  selection: string
  urlWarning?: string
  warmupTargets: StudioPreviewWarmupTarget[]
  workspace: StudioWorkspaceState
}

const studioPreviewWarmupLimit = 4

function useStudioShellScope(props: StudioShellProps): StudioShellScope {
  const initialUrlState = React.useMemo(
    () => createStudioWorkspaceStateFromUrl(props.manifest, initialStudioUrlSearchParams(props.selection, props.urlSearch)),
    [props.manifest, props.selection, props.urlSearch],
  )
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const [canvas, setCanvas] = React.useState(initialUrlState.canvas)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const [frameStates, setFrameStates] = React.useState<Record<string, StudioPreviewFrameState>>({})
  const [previewCache, setPreviewCache] = React.useState<Record<string, StudioPreviewCacheEntry>>({})
  const [warmupsEnabled, setWarmupsEnabled] = React.useState(false)
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const previewFrameMountedAt = React.useRef(new Map<string, number>())
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])
  const currentTargets = React.useMemo(() => currentStudioPreviewTargets(props.manifest, workspace), [props.manifest, workspace])
  const warmupTargets = React.useMemo(
    () => (warmupsEnabled ? studioPreviewWarmupTargets(props.manifest, workspace, { limit: studioPreviewWarmupLimit }) : []),
    [props.manifest, warmupsEnabled, workspace],
  )
  const targetsBySessionId = React.useMemo(
    () => new Map([...currentTargets, ...warmupTargets].map((target) => [target.sessionId, target] as const)),
    [currentTargets, warmupTargets],
  )
  const canvasRef = React.useRef(canvas)
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
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message)) return

      const target = targetsBySessionId.get(message.sessionId)
      if (!target) return

      if (sessionIds.has(message.sessionId)) {
        setFrameStates((current) => applyStudioPreviewMessageToFrameStates(current, message, sessionIds))
      }
      dispatchStudioPreviewTiming(target, message, previewFrameMountedAt.current.get(message.sessionId))
      setPreviewCache((current) => {
        const currentEntry = current[target.cacheKey]
        const currentFrameState = currentEntry?.frameState ?? {
          expectedSessionId: message.sessionId,
          ready: false,
        }
        return {
          ...current,
          [target.cacheKey]: {
            frameState: applyStudioPreviewMessage(currentFrameState, message),
            lastUsedAt: Date.now(),
          },
        }
      })
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [sessionIds, targetsBySessionId])

  React.useEffect(() => {
    const handlePopState = () => {
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search))
      setSelection(restored.selection)
      setCanvas(restored.canvas)
      setUrlWarning(restored.warning)
      setWorkspace(restored.workspace)
      setFrameStates({})
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [props.manifest])

  const commitWorkspace = React.useCallback((updater: (current: StudioWorkspaceState) => StudioWorkspaceState) => {
    setWorkspace((current) => {
      const next = updater(current)
      pushStudioWorkspaceUrlState(selectionRef.current, next, { canvas: canvasRef.current })
      return next
    })
  }, [])

  const commitCanvas = React.useCallback((nextCanvas: StudioCanvasTransform) => {
    canvasRef.current = nextCanvas
    setCanvas(nextCanvas)
    replaceStudioCanvasUrlState(nextCanvas)
  }, [])

  return {
    canvas,
    frameStates,
    onChangeCanvas: commitCanvas,
    onChangeCanvasViewportPreset(preset) {
      commitWorkspace((current) => changeStudioCanvasViewportPreset(current, preset))
    },
    onChangeCase(component, caseName, options) {
      commitWorkspace((current) => changeStudioComponentCase(current, component.coordinate, caseName, options))
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
    onSelectComponent(component, frameState) {
      commitWorkspace((current) => selectStudioComponent(current, props.manifest, component.coordinate, frameState?.tree ?? []))
    },
    previewCache,
    selection,
    urlWarning,
    warmupTargets,
    workspace,
  }
}

export default function StudioShell(props: StudioShellProps) {
  const scope = useStudioShellScope(props)

  return (
    <>
      <StudioWorkspaceView
        canvas={scope.canvas}
        frameStates={scope.frameStates}
        manifest={props.manifest}
        onChangeCanvas={scope.onChangeCanvas}
        onSelectComponent={scope.onSelectComponent}
        onChangeCase={scope.onChangeCase}
        onChangeCanvasViewportPreset={scope.onChangeCanvasViewportPreset}
        onChangeSelection={scope.onChangeSelection}
        onChangeViewportPreset={scope.onChangeViewportPreset}
        onPreviewFrameMount={scope.onPreviewFrameMount}
        previewCache={scope.previewCache}
        selection={scope.selection}
        urlWarning={scope.urlWarning}
        workspace={scope.workspace}
      />
      <StudioPreviewWarmups targets={scope.warmupTargets} />
    </>
  )
}

function StudioPreviewWarmups(props: { targets: StudioPreviewWarmupTarget[] }) {
  if (props.targets.length === 0) return null

  return (
    <div aria-hidden="true" data-gtsx-preview-warmups="true" style={{ height: 0, overflow: "hidden", position: "fixed", width: 0 }}>
      {props.targets.map((target) => (
        <div key={target.cacheKey} style={{ height: 0, overflow: "hidden", position: "relative", width: 0 }}>
          <BufferedPreviewIframe
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
