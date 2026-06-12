"use client"

import React from "react"
import { createGScopeHook, type GFrames } from "@runelight/react/runtime"
import type { GBoundaryRect } from "@runelight/core/boundary-rect"
import { isGPreviewSessionMessage, type GPreviewSessionMessage } from "@runelight/core/preview-protocol"

import type { StudioPreviewFrameState } from "../client"
import { studioBoundaryRectForCoordinate } from "../boundary-tree"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import { studioColors } from "../studio-theme"

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

const studioSidebarPreviewPreloadMargin = 280

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
      { rootMargin: `${studioSidebarPreviewPreloadMargin}px` },
    )
    observer.observe(containerElement)
    return () => observer.disconnect()
  }, [containerElement])

  React.useEffect(() => {
    if (!shouldLoad) return

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as GPreviewSessionMessage
      if (!isGPreviewSessionMessage(message) || message.sessionId !== sessionId || message.type !== "runelight:tree") return

      setBoundaryRect(studioBoundaryRectForCoordinate(message.tree, component.coordinate))
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
      data-runelight-sidebar-preview-coordinate={props.component.coordinate}
      data-runelight-sidebar-preview-loaded={scope.shouldLoad ? "true" : undefined}
      data-runelight-viewport-preset="tablet"
      ref={scope.setContainerElement}
      style={{
        background: studioColors.panelBgElevated,
        height,
        overflow: "hidden",
        position: "relative",
        width: 184.32,
      }}
    >
      {previewUrl && scope.shouldLoad ? (
        <iframe
          data-runelight-sidebar-preview-frame="true"
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

SidebarComponentPreview.frames = {
  tabletLoaded: {
    props: {
      component: {
        coordinate: "src/UserCard.g.tsx#default",
        filePath: "src/UserCard.g.tsx",
        sourceHash: "user-card-source",
        exportName: "default",
        componentName: "UserCard",
        mode: "scope",
        frames: [{ kind: "scope", name: "ready" }],
        providers: {},
        diagnostics: [],
      },
      manifest: {
        version: 1,
        routes: {
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
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
} satisfies GFrames<SidebarComponentPreviewProps, SidebarComponentPreviewScope>

function sidebarPreviewUrlForComponent(manifest: StudioManifest, component: StudioManifestComponent): string | undefined {
  const frameName = component.frames[0]?.name
  if (!frameName) return undefined

  const params = new URLSearchParams({
    entry: component.coordinate,
    frame: frameName,
    chrome: "0",
    sessionId: sidebarPreviewSessionId(component),
    static: "1",
  })
  return `${manifest.routes.preview}?${params.toString()}`
}

function sidebarPreviewSessionId(component: StudioManifestComponent): string {
  return `sidebar:${component.coordinate}:${component.frames[0]?.name ?? "No frames"}`
}

function selectedBoundaryRectForComponent(tree: StudioPreviewFrameState["tree"], coordinate: string): GBoundaryRect | undefined {
  return studioBoundaryRectForCoordinate(tree, coordinate)
}
