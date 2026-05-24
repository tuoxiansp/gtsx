"use client"

import React from "react"
import { createGScope, type GCases, type GPreviewProtocolMessage } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  applyStudioPreviewMessageToFrameStates,
  canvasViewportPresetForWorkspace,
  changeStudioCanvasViewportPreset,
  changeStudioComponentCase,
  changeStudioViewportPreset,
  createStudioWorkspaceStateFromUrl,
  currentPreviewSessionIds,
  initialStudioUrlSearchParams,
  isGPreviewProtocolMessage,
  pushStudioWorkspaceUrlState,
  selectStudioComponent,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
  type StudioWorkspaceState,
} from "../client"
import StudioWorkspaceView from "./StudioWorkspaceView.g"

export type StudioShellProps = {
  manifest: StudioManifest
  selection?: string
  urlSearch?: string
}

type StudioShellScope = {
  frameStates: Record<string, StudioPreviewFrameState>
  onChangeCanvasViewportPreset: (preset: StudioViewportPreset) => void
  onChangeCase: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  onChangeSelection: (selection: string) => void
  onChangeViewportPreset: (component: StudioManifestComponent, preset: StudioViewportPreset) => void
  onPreviewFrameMount: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelectComponent: (component: StudioManifestComponent, frameState: StudioPreviewFrameState | undefined) => void
  selection: string
  urlWarning?: string
  workspace: StudioWorkspaceState
}

function useRealStudioShellScope(props: StudioShellProps): StudioShellScope {
  const initialUrlState = React.useMemo(
    () => createStudioWorkspaceStateFromUrl(props.manifest, initialStudioUrlSearchParams(props.selection, props.urlSearch)),
    [props.manifest, props.selection, props.urlSearch],
  )
  const [selection, setSelection] = React.useState(initialUrlState.selection)
  const [urlWarning, setUrlWarning] = React.useState(initialUrlState.warning)
  const [workspace, setWorkspace] = React.useState(initialUrlState.workspace)
  const [frameStates, setFrameStates] = React.useState<Record<string, StudioPreviewFrameState>>({})
  const previewFrames = React.useRef(new Map<string, HTMLIFrameElement>())
  const sessionIds = React.useMemo(() => currentPreviewSessionIds(workspace), [workspace])
  const selectionRef = React.useRef(selection)

  React.useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || !sessionIds.has(message.sessionId)) return

      setFrameStates((current) => applyStudioPreviewMessageToFrameStates(current, message, sessionIds))
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [sessionIds])

  React.useEffect(() => {
    const handlePopState = () => {
      const restored = createStudioWorkspaceStateFromUrl(props.manifest, new URLSearchParams(window.location.search))
      setSelection(restored.selection)
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
      pushStudioWorkspaceUrlState(selectionRef.current, next)
      return next
    })
  }, [])

  return {
    frameStates,
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
      pushStudioWorkspaceUrlState(nextUrlState.selection, nextUrlState.workspace)
    },
    onChangeViewportPreset(component, preset) {
      commitWorkspace((current) => changeStudioViewportPreset(current, component.coordinate, preset))
    },
    onPreviewFrameMount(sessionId, frame) {
      if (frame) {
        previewFrames.current.set(sessionId, frame)
      } else {
        previewFrames.current.delete(sessionId)
      }
    },
    onSelectComponent(component, frameState) {
      commitWorkspace((current) => selectStudioComponent(current, props.manifest, component.coordinate, frameState?.tree ?? []))
    },
    selection,
    urlWarning,
    workspace,
  }
}

const useStudioShellScope = createGScope(useRealStudioShellScope)

export default function StudioShell(props: StudioShellProps) {
  const scope = useStudioShellScope(props)

  return (
    <StudioWorkspaceView
      frameStates={scope.frameStates}
      manifest={props.manifest}
      onSelectComponent={scope.onSelectComponent}
      onChangeCase={scope.onChangeCase}
      onChangeCanvasViewportPreset={scope.onChangeCanvasViewportPreset}
      onChangeSelection={scope.onChangeSelection}
      onChangeViewportPreset={scope.onChangeViewportPreset}
      onPreviewFrameMount={scope.onPreviewFrameMount}
      selection={scope.selection}
      urlWarning={scope.urlWarning}
      workspace={scope.workspace}
    />
  )
}

StudioShell.cases = {
  multiExportFile: {
    props: {
      manifest: {
        version: 1,
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        preview: {
          urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
          allUrlTemplate: "/gtsx?entry={entry}{gcase}",
        },
        files: [
          {
            path: "src/MultiExport.g.tsx",
            groupId: "file:src/MultiExport.g.tsx",
            components: [
              {
                coordinate: "src/MultiExport.g.tsx#NamedBadge",
                filePath: "src/MultiExport.g.tsx",
                exportName: "NamedBadge",
                componentName: "NamedBadge",
                mode: "pure",
                cases: [{ kind: "pure", name: "ready" }],
                providers: {},
                diagnostics: [],
              },
            ],
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
      selection: "file:src/MultiExport.g.tsx",
    },
    scope: {
      frameStates: {},
      onChangeCanvasViewportPreset() {},
      onChangeCase() {},
      onChangeSelection() {},
      onChangeViewportPreset() {},
      onPreviewFrameMount() {},
      onSelectComponent() {},
      selection: "file:src/MultiExport.g.tsx",
      workspace: {
        canvasViewportPreset: "tablet",
        columns: [
          {
            components: [
              {
                coordinate: "src/MultiExport.g.tsx#NamedBadge",
                filePath: "src/MultiExport.g.tsx",
                exportName: "NamedBadge",
                componentName: "NamedBadge",
                mode: "pure",
                cases: [{ kind: "pure", name: "ready" }],
                providers: {},
                diagnostics: [],
              },
            ],
          },
        ],
        selectedCaseByCoordinate: {},
        selectedCoordinatePath: [],
        selectedRuntimeInstanceByCoordinate: {},
        selectedViewportPresetByCoordinate: {},
      },
    },
  },
} satisfies GCases<StudioShellProps, StudioShellScope>
