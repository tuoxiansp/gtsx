"use client"

import React from "react"
import { createGScopeHook, type GBoundaryRect, type GBoundaryTreeNode, type GCases, type GPreviewProtocolMessage } from "gtsx"

import type { StudioPreviewFrameState } from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"

type SidebarComponentPreviewProps = {
  component: StudioManifestComponent
  frameState?: StudioPreviewFrameState
  manifest: StudioManifest
}

type SidebarComponentPreviewScope = {
  boundaryRect?: GBoundaryRect
  setContainerElement: (element: HTMLDivElement | null) => void
  shouldLoad: boolean
}

function useRealSidebarComponentPreviewScope(component: StudioManifestComponent): SidebarComponentPreviewScope {
  const sessionId = sidebarPreviewSessionId(component)
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null)
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const [boundaryRect, setBoundaryRect] = React.useState<GBoundaryRect | undefined>()

  React.useEffect(() => {
    if (!containerElement) return

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true)
          observer.disconnect()
        }
      },
      { rootMargin: "500px" },
    )
    observer.observe(containerElement)
    return () => observer.disconnect()
  }, [containerElement])

  React.useEffect(() => {
    if (!shouldLoad) return

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewProtocolMessage
      if (!isGPreviewProtocolMessage(message) || message.sessionId !== sessionId || message.type !== "gtsx:tree") return

      setBoundaryRect(findBoundaryNode(message.tree, component.coordinate)?.rect)
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [component.coordinate, sessionId, shouldLoad])

  return { boundaryRect, setContainerElement, shouldLoad }
}

const useSidebarComponentPreviewScope = createGScopeHook(useRealSidebarComponentPreviewScope)

export default function SidebarComponentPreview(props: SidebarComponentPreviewProps) {
  const previewUrl = sidebarPreviewUrlForComponent(props.manifest, props.component)
  const scope = useSidebarComponentPreviewScope(props.component)
  const boundaryRect = scope.boundaryRect ?? selectedBoundaryRectForComponent(props.frameState?.tree, props.component.coordinate)
  const height = boundaryRect ? Math.max(1, Math.ceil((Math.max(0, boundaryRect.y) + boundaryRect.height) * 0.24)) : 96

  return (
    <div
      aria-hidden="true"
      data-gtsx-sidebar-preview-coordinate={props.component.coordinate}
      data-gtsx-sidebar-preview-loaded={scope.shouldLoad ? "true" : undefined}
      data-gtsx-viewport-preset="tablet"
      ref={scope.setContainerElement}
      style={{
        background: "#f5f6f8",
        height,
        overflow: "hidden",
        position: "relative",
        width: 184.32,
      }}
    >
      {previewUrl && scope.shouldLoad ? (
        <iframe
          data-gtsx-sidebar-preview-frame="true"
          src={previewUrl}
          style={{
            background: "transparent",
            border: 0,
            height: 1024,
            left: 0,
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            transform: "scale(0.24)",
            transformOrigin: "0 0",
            width: 768,
          }}
          tabIndex={-1}
          title={`${props.component.componentName} thumbnail`}
        />
      ) : null}
    </div>
  )
}

SidebarComponentPreview.cases = {
  tabletLoaded: {
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
      frameState: {
        expectedSessionId: "sidebar:src/UserCard.g.tsx#default:ready",
        ready: true,
        tree: [
          {
            id: "root",
            coordinate: "src/UserCard.g.tsx#default",
            rect: { x: 0, y: 12, width: 320, height: 88 },
            children: [],
          },
        ],
      },
    },
    scope: {
      boundaryRect: { x: 0, y: 12, width: 320, height: 88 },
      setContainerElement() {},
      shouldLoad: true,
    },
  },
} satisfies GCases<SidebarComponentPreviewProps, SidebarComponentPreviewScope>

function sidebarPreviewUrlForComponent(manifest: StudioManifest, component: StudioManifestComponent): string | undefined {
  const caseName = component.cases[0]?.name
  if (!caseName) return undefined

  const params = new URLSearchParams({
    entry: component.coordinate,
    case: caseName,
    chrome: "0",
    sessionId: sidebarPreviewSessionId(component),
    static: "1",
  })
  return `${manifest.routes.preview}?${params.toString()}`
}

function sidebarPreviewSessionId(component: StudioManifestComponent): string {
  return `sidebar:${component.coordinate}:${component.cases[0]?.name ?? "No cases"}`
}

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

function isGPreviewProtocolMessage(value: unknown): value is GPreviewProtocolMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    (value as { type: string }).type.startsWith("gtsx:")
  )
}
