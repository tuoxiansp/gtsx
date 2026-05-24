"use client"

import React from "react"
import { createGScope, type GBoundaryRect, type GBoundaryTreeNode, type GCases } from "gtsx"

import type { StudioPreviewFrameState } from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import LazyPreviewFrame from "./LazyPreviewFrame.g"
import PreviewError from "./PreviewError.g"

type StudioViewportPreset = "phone" | "tablet" | "desktop"
type StudioCardSelectionSource = "keyboard" | "pointer"

type ComponentCardFrameState = StudioPreviewFrameState

type ComponentCardWorkspace = {
  selectedCaseByCoordinate: Record<string, string>
  selectedCoordinatePath: string[]
}

type ComponentCardProps = {
  component: StudioManifestComponent
  frameState?: ComponentCardFrameState
  manifest: StudioManifest
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelect?: (component: StudioManifestComponent, frameState: ComponentCardFrameState | undefined, source: StudioCardSelectionSource) => void
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
  workspace: ComponentCardWorkspace
}

type ComponentCardScope = {
  measuredSize?: { width: number; height: number }
  setMeasuredSize: (size: { width: number; height: number }) => void
}

function useRealComponentCardScope(): ComponentCardScope {
  const [measuredSize, setMeasuredSize] = React.useState<{ width: number; height: number } | undefined>()
  return { measuredSize, setMeasuredSize }
}

const useComponentCardScope = createGScope(useRealComponentCardScope)

export default function ComponentCard(props: ComponentCardProps) {
  const scope = useComponentCardScope()
  const defaultCase = props.selectedCaseName
  const previewError = getPreviewError(props.component)
  const caseOverrides = previewCaseOverridesForComponent(props.workspace, props.component)
  const sessionId = previewSessionId(props.component, defaultCase, caseOverrides)
  const previewSize = previewFrameSize(props.viewportPreset, props.frameState?.size)
  const displaySize = mergePreviewFrameSize(previewSize, scope.measuredSize, props.viewportPreset)
  const previewUrl = previewUrlForComponent(props.manifest, props.component, defaultCase, caseOverrides)
  const cardWidth = componentCardLayoutWidth(displaySize, props.frameState?.tree, props.component.coordinate)
  const selectedBoundaryRect = props.selected ? selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate) : undefined

  return (
    <article
      aria-pressed={props.selected}
      data-gtsx-card-coordinate={props.component.coordinate}
      data-gtsx-card-selected={props.selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        props.onSelect?.(props.component, props.frameState, "keyboard")
      }}
      role="button"
      style={{
        cursor: props.onSelect ? "pointer" : "default",
        display: "grid",
        gap: 6,
        width: cardWidth,
      }}
      tabIndex={0}
    >
      <strong
        style={{
          color: "inherit",
          fontSize: 13,
          letterSpacing: -0.05,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {props.component.componentName}
      </strong>
      {previewError || props.frameState?.error ? (
        <PreviewError
          caseName={defaultCase}
          coordinate={props.component.coordinate}
          error={props.frameState?.error ?? { message: previewError ?? "Unknown preview error" }}
          previewUrl={previewUrl}
        />
      ) : (
        <LazyPreviewFrame
          data-gtsx-preview-session-id={sessionId}
          boundaryRect={selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate)}
          coordinate={props.component.coordinate}
          frameState={props.frameState}
          onMeasureSize={scope.setMeasuredSize}
          onSelect={() => props.onSelect?.(props.component, props.frameState, "pointer")}
          onPreviewFrameMount={props.onPreviewFrameMount}
          previewUrl={previewUrl}
          selectedBoundaryRect={selectedBoundaryRect}
          size={displaySize}
          sessionId={sessionId}
          title={`${props.component.componentName} preview`}
          viewportPreset={props.viewportPreset}
        />
      )}
    </article>
  )
}

ComponentCard.cases = {
  selectedReady: {
    props: {
      component: {
        coordinate: "src/UserCard.g.tsx#default",
        filePath: "src/UserCard.g.tsx",
        exportName: "default",
        componentName: "UserCard",
        mode: "scope",
        cases: [{ kind: "scope", name: "ready" }],
        providers: {},
        diagnostics: [],
      },
      frameState: {
        expectedSessionId: "src/UserCard.g.tsx#default:ready",
        ready: true,
        tree: [
          {
            id: "root",
            coordinate: "src/UserCard.g.tsx#default",
            rect: { x: 10, y: 20, width: 320, height: 88 },
            children: [],
          },
        ],
      },
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
        files: [],
        diagnostics: [],
      },
      selected: true,
      selectedCaseName: "ready",
      viewportPreset: "phone",
      workspace: {
        selectedCaseByCoordinate: {},
        selectedCoordinatePath: ["src/UserCard.g.tsx#default"],
      },
    },
    scope: {
      setMeasuredSize() {},
    },
  },
} satisfies GCases<ComponentCardProps, ComponentCardScope>

function componentCardLayoutWidth(
  displaySize: { width: number | string },
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): number {
  const rect = tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
  if (rect) return Math.max(280, Math.ceil(Math.max(0, rect.x) + rect.width))
  return typeof displaySize.width === "number" ? displaySize.width + 28 : 520
}

function selectedBoundaryRectForComponent(tree: GBoundaryTreeNode[] | undefined, coordinate: string): GBoundaryRect | undefined {
  return tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
}

function previewFrameSize(
  preset: StudioViewportPreset,
  reportedSize: ComponentCardFrameState["size"] | undefined,
): { width: number | string; height: number } {
  if (preset === "phone") return { width: 390, height: 844 }
  if (preset === "tablet") return { width: 768, height: 1024 }
  if (preset === "desktop") return { width: 1280, height: 900 }
  return { width: 768, height: clamp(reportedSize?.height ?? 1024, 160, 1200) }
}

function mergePreviewFrameSize(
  reported: { width: number | string; height: number },
  _measured: { width: number; height: number } | undefined,
  _preset: StudioViewportPreset,
): { width: number | string; height: number } {
  return reported
}

function getPreviewError(component: StudioManifestComponent): string | undefined {
  if (component.diagnostics.length > 0) {
    return component.diagnostics.map((diagnostic) => diagnostic.code).join(", ")
  }

  if (!component.cases[0]) {
    return "missing-case"
  }

  return undefined
}

function previewUrlForComponent(
  manifest: StudioManifest,
  component: StudioManifestComponent,
  caseName: string,
  caseOverrides: readonly (readonly [string, string])[] = [],
): string {
  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId: previewSessionId(component, caseName, caseOverrides),
  })
  for (const [coordinate, overrideCaseName] of caseOverrides) {
    params.append("gcase", `${coordinate}:${overrideCaseName}`)
  }

  return `${manifest.routes.preview}?${params.toString()}`
}

function previewSessionId(
  component: StudioManifestComponent,
  caseName: string,
  caseOverrides: readonly (readonly [string, string])[] = [],
): string {
  if (caseOverrides.length === 0) return `${component.coordinate}:${caseName}`

  return `${component.coordinate}:${caseName}|${caseOverrides
    .map(([coordinate, overrideCaseName]) => `${coordinate}:${overrideCaseName}`)
    .join("|")}`
}

function previewCaseOverridesForComponent(
  workspace: Pick<ComponentCardWorkspace, "selectedCaseByCoordinate" | "selectedCoordinatePath">,
  component: StudioManifestComponent,
): readonly (readonly [string, string])[] {
  const componentPathIndex = workspace.selectedCoordinatePath.indexOf(component.coordinate)
  if (componentPathIndex < 0) return []

  return workspace.selectedCoordinatePath
    .slice(componentPathIndex + 1)
    .flatMap((coordinate) => {
      const caseName = workspace.selectedCaseByCoordinate[coordinate]
      return caseName ? ([[coordinate, caseName]] as const) : []
    })
}

function findBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
