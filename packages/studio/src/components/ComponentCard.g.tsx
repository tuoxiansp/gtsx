"use client"

import type { GBoundaryRect, GBoundaryTreeNode, GCases } from "gtsx"

import {
  clipPreviewBoundaryRectToViewport,
  componentCardLayoutWidth,
  createStudioPreviewUrl,
  previewSessionId,
  studioPreviewFrameSize,
  type StudioPreviewFrameState,
} from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import LazyPreviewFrame from "./LazyPreviewFrame.g"
import PreviewError from "./PreviewError.g"

type StudioViewportPreset = "phone" | "tablet" | "desktop"
type StudioCardSelectionSource = "keyboard" | "pointer"

type ComponentCardFrameState = StudioPreviewFrameState

type ComponentCardProps = {
  component: StudioManifestComponent
  frameState?: ComponentCardFrameState
  manifest: StudioManifest
  onPreviewFrameMount?: (sessionId: string, frame: HTMLIFrameElement | null) => void
  onSelect?: (component: StudioManifestComponent, frameState: ComponentCardFrameState | undefined, source: StudioCardSelectionSource) => void
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
}

export default function ComponentCard(props: ComponentCardProps) {
  const defaultCase = props.selectedCaseName
  const previewError = getPreviewError(props.component)
  const sessionId = previewSessionId(props.component, defaultCase, props.viewportPreset)
  const displaySize = studioPreviewFrameSize(props.viewportPreset, props.frameState?.size)
  const previewUrl = createStudioPreviewUrl(props.manifest, props.component, defaultCase, sessionId)
  const boundaryRect = selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate)
  const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)
  const cardWidth = componentCardLayoutWidth(displaySize, props.frameState?.tree, props.component.coordinate)
  const selectedBoundaryRect = props.selected ? visibleBoundaryRect : undefined

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
          boundaryRect={visibleBoundaryRect}
          coordinate={props.component.coordinate}
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
    },
  },
} satisfies GCases<ComponentCardProps>

function selectedBoundaryRectForComponent(tree: GBoundaryTreeNode[] | undefined, coordinate: string): GBoundaryRect | undefined {
  return tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
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

function findBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}

