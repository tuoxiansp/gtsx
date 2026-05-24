"use client"

import { type GBoundaryRect, type GBoundaryTreeNode, type GCases } from "gtsx"

import { createStudioPreviewUrl, studioPreviewFrameSize, type StudioPreviewFrameState } from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"

type CasePreviewCardProps = {
  component: StudioManifestComponent
  frameState?: StudioPreviewFrameState
  manifest: StudioManifest
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  selected: boolean
  testCaseName: string
}

const studioCasePreviewScale = 0.25
const studioCasePreviewWidth = 192

export default function CasePreviewCard(props: CasePreviewCardProps) {
  const previewUrl = createStudioPreviewUrl(props.manifest, props.component, props.testCaseName)
  const boundaryRect = selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate)
  const frameSize = studioPreviewFrameSize("tablet", props.frameState?.size)
  const height = boundaryRect ? Math.max(64, Math.ceil(boundaryRect.height * studioCasePreviewScale) + 32) : 112
  const iframeOffset = boundaryRect
    ? {
        left: (studioCasePreviewWidth - boundaryRect.width * studioCasePreviewScale) / 2 - boundaryRect.x * studioCasePreviewScale,
        top: (height - boundaryRect.height * studioCasePreviewScale) / 2 - boundaryRect.y * studioCasePreviewScale,
      }
    : { left: 0, top: 0 }

  return (
    <div
      data-gtsx-case-preview-card={props.testCaseName}
      data-gtsx-case-preview-selected={props.selected ? "true" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        props.onChangeCase?.(props.component, props.testCaseName, { keepDrilldown: true })
      }}
      onClick={() => props.onChangeCase?.(props.component, props.testCaseName, { keepDrilldown: true })}
      role="button"
      style={{
        background: "transparent",
        border: 0,
        boxShadow: "none",
        color: "#1f2328",
        cursor: props.onChangeCase ? "pointer" : "default",
        display: "grid",
        gap: 6,
        padding: 0,
        textAlign: "left",
      }}
      tabIndex={0}
    >
      <strong style={{ fontSize: 12, lineHeight: 1.2 }}>{props.testCaseName}</strong>
      <div
        aria-hidden="true"
        data-gtsx-case-preview-frame={props.testCaseName}
        style={{
          background: "#ffffff",
          border: "1px solid",
          borderColor: props.selected ? "#0d99ff" : "transparent",
          borderRadius: 10,
          boxShadow: props.selected ? "0 0 0 4px rgba(13, 153, 255, 0.18)" : "none",
          height,
          overflow: "hidden",
          position: "relative",
          width: studioCasePreviewWidth,
        }}
      >
        <iframe
          src={previewUrl}
          style={{
            background: "transparent",
            border: 0,
            height: frameSize.height,
            left: iframeOffset.left,
            pointerEvents: "none",
            position: "absolute",
            top: iframeOffset.top,
            transform: `scale(${studioCasePreviewScale})`,
            transformOrigin: "0 0",
            width: frameSize.width,
          }}
          tabIndex={-1}
          title={`${props.component.componentName} ${props.testCaseName} preview`}
        />
      </div>
    </div>
  )
}

CasePreviewCard.cases = {
  readySelected: {
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
            rect: { x: 12, y: 20, width: 320, height: 88 },
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
      testCaseName: "ready",
    },
  },
} satisfies GCases<CasePreviewCardProps>

function selectedBoundaryRectForComponent(tree: GBoundaryTreeNode[] | undefined, coordinate: string): GBoundaryRect | undefined {
  return tree ? findBoundaryNode(tree, coordinate)?.rect : undefined
}

function findBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}

