"use client"

import React from "react"
import type { GBoundaryRect, GFrames } from "@gtsx/core"

import {
  clipPreviewBoundaryRectToViewport,
  computeStudioFrameGridLayout,
  createStudioPreviewUrl,
  previewSessionId,
  studioPreviewFrameOverridesForProviderVariantContext,
  studioPreviewFrameSize,
  studioProviderVariantFrameStatus,
  sameStudioProviderVariantContext,
  type StudioPreviewFrameOverride,
  type StudioProviderVariantContext,
  type StudioPreviewFrameState,
} from "../client"
import {
  studioFrameGridMaxSide,
  studioComponentCardTitleGap,
  studioComponentCardTitleHeight,
  studioComponentCardTitleScreenGap,
  studioComponentCardTitleScreenHeight,
  studioComponentFrameChromeHeight,
  studioComponentFrameGridGap,
  studioComponentFrameLabelGap,
  studioComponentFrameLabelMinHeight,
  studioComponentFrameLabelScreenGap,
  studioComponentFrameGridMinScale,
  studioComponentFrameMismatchBorderOutset,
} from "../frame-grid-layout"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { previewFrameLayoutHeight, previewFrameLayoutWidth } from "../preview-frame-layout"
import { studioBoundaryRectForCoordinate } from "../boundary-tree"
import LazyPreviewFrame from "./LazyPreviewFrame.g"
import PreviewError from "./PreviewError.g"
import {
  studioFrameLabelStyle,
  studioCardTitleIndicatorStyle,
  studioCardTitleStyle,
  studioColors,
  studioRadii,
} from "../studio-theme"
import {
  studioCanvasScreenStableChromeBorderWidth,
  studioCanvasScreenStableChromeContentAfterCanvasGapStyle,
  studioCanvasScreenStableChromeContentBeforeCanvasAnchorStyle,
  studioCanvasScreenStableChromeSlotStyle,
} from "../studio-canvas-screen-stable-chrome"

type StudioViewportPreset = "phone" | "tablet" | "desktop"
type StudioCardSelectionSource = "keyboard" | "pointer"

type ComponentCardFrameState = StudioPreviewFrameState

type ComponentCardProps = {
  frameStatesByName?: Record<string, ComponentCardFrameState | undefined>
  layoutFrameStatesByName?: Record<string, ComponentCardFrameState | undefined>
  framePreviewScale?: number
  columnIndex?: number
  component: StudioManifestComponent
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  frameState?: ComponentCardFrameState
  manifest: StudioManifest
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  onSelect?: (
    component: StudioManifestComponent,
    frameStatesByName: Record<string, ComponentCardFrameState | undefined>,
    columnIndex: number,
    source: StudioCardSelectionSource,
  ) => void
  providerVariantComponent?: StudioManifestComponent
  providerVariantContext?: StudioProviderVariantContext
  previewFrameOverrides?: readonly StudioPreviewFrameOverride[]
  selected: boolean
  selectedFrameName: string
  viewportPreset: StudioViewportPreset
}

function ComponentCardView(props: ComponentCardProps) {
  const previewError = getPreviewError(props.component)
  const providerVariantComponent = props.providerVariantComponent ?? props.component
  const previewFrameOverrides =
    props.previewFrameOverrides ??
    studioPreviewFrameOverridesForProviderVariantContext(props.manifest, props.providerVariantContext ?? {})
  const effectiveFrameStatesByName = Object.fromEntries(
    props.component.frames.map((frame) => [
      frame.name,
      props.frameStatesByName?.[frame.name] ?? (frame.name === props.selectedFrameName ? props.frameState : undefined),
    ]),
  ) as Record<string, ComponentCardFrameState | undefined>
  const effectiveLayoutFrameStatesByName = Object.fromEntries(
    props.component.frames.map((frame) => [
      frame.name,
      props.layoutFrameStatesByName?.[frame.name] ?? effectiveFrameStatesByName[frame.name],
    ]),
  ) as Record<string, ComponentCardFrameState | undefined>
  const frameTiles = props.component.frames.map((frame) => {
    const frameState = effectiveFrameStatesByName[frame.name]
    const layoutFrameState = effectiveLayoutFrameStatesByName[frame.name]
    const sessionId = previewSessionId(props.component, frame.name, props.viewportPreset)
    const displaySize = studioPreviewFrameSize(props.viewportPreset, layoutFrameState?.size)
    const previewUrl = createStudioPreviewUrl(props.manifest, props.component, frame.name, sessionId, {
      frameOverrides: previewFrameOverrides,
      static: true,
    })
    const boundaryRect = boundaryRectForComponent(layoutFrameState?.tree, props.component.coordinate)
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)
    const layoutWidth = Number(previewFrameLayoutWidth(displaySize, visibleBoundaryRect))
    const layoutHeight = previewFrameLayoutHeight(displaySize, visibleBoundaryRect)
    const providerVariantStatus = studioProviderVariantFrameStatus(
      providerVariantComponent,
      frame,
      props.providerVariantContext,
    )

    return {
      displaySize,
      frameState,
      layoutHeight,
      layoutWidth,
      name: frame.name,
      previewUrl,
      providerVariantStatus,
      sessionId,
      visibleBoundaryRect,
    }
  })
  const frameGridLayout = computeStudioFrameGridLayout({
    frameChromeHeight: studioComponentFrameChromeHeight,
    gap: studioComponentFrameGridGap,
    items: frameTiles.map((tile) => ({ height: tile.layoutHeight, width: tile.layoutWidth })),
    maxSide: studioFrameGridMaxSide(props.viewportPreset, frameTiles.length),
    minScale: studioComponentFrameGridMinScale,
    previewScale: props.framePreviewScale,
  })
  const cardWidth = Math.max(280, frameGridLayout.width)
  const columnIndex = props.columnIndex ?? 0
  const firstFrameName = props.component.frames[0]?.name ?? props.selectedFrameName

  return (
    <article
      aria-label={props.component.componentName}
      data-gtsx-card-coordinate={props.component.coordinate}
      data-gtsx-card-selected={props.selected ? "true" : undefined}
      style={{
        display: "grid",
        gap: 0,
        width: cardWidth,
      }}
    >
      <div
        data-gtsx-canvas-screen-stable-chrome="card-title"
        style={studioCanvasScreenStableChromeSlotStyle({
          height: studioComponentCardTitleHeight + studioComponentCardTitleGap,
          width: cardWidth,
        })}
      >
        <span
          data-gtsx-card-title-selected={props.selected ? "true" : undefined}
          style={{
            ...studioCardTitleStyle(props.selected),
            ...studioCanvasScreenStableChromeContentBeforeCanvasAnchorStyle({
              anchorCanvasLength: studioComponentCardTitleHeight + studioComponentCardTitleGap,
              screenGapAfter: studioComponentCardTitleScreenGap,
              screenLength: studioComponentCardTitleScreenHeight,
            }),
          }}
        >
          <span aria-hidden="true" style={studioCardTitleIndicatorStyle(props.selected)} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {props.component.componentName}
          </span>
        </span>
      </div>
      {previewError ? (
        <PreviewError
          frameName={firstFrameName}
          coordinate={props.component.coordinate}
          error={{ message: previewError }}
          previewUrl={createStudioPreviewUrl(props.manifest, props.component, firstFrameName, undefined, { static: true })}
        />
      ) : (
        <div
          data-gtsx-frame-grid={props.component.coordinate}
          data-gtsx-frame-grid-columns={frameGridLayout.columns}
          data-gtsx-frame-grid-preview-scale={frameGridLayout.previewScale}
          data-gtsx-frame-grid-selected={props.selected ? "true" : undefined}
          style={{
            display: "grid",
            gap: frameGridLayout.gap,
            gridTemplateColumns: `repeat(${frameGridLayout.columns}, ${frameGridLayout.cellWidth}px)`,
            position: "relative",
            width: frameGridLayout.width,
          }}
        >
          {frameTiles.map((tile) => (
            <div
              data-gtsx-frame-provider-variant-state={tile.providerVariantStatus.state}
              data-gtsx-frame-tile={tile.name}
              key={tile.name}
              onClick={() => props.onSelect?.(props.component, effectiveFrameStatesByName, columnIndex, "pointer")}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                props.onSelect?.(props.component, effectiveFrameStatesByName, columnIndex, "keyboard")
              }}
              onPointerDown={(event) => event.stopPropagation()}
              role="button"
              style={{
                cursor: props.onSelect ? "pointer" : "default",
                display: "grid",
                gap: studioComponentFrameLabelGap,
                justifyItems: "center",
                minWidth: 0,
                width: frameGridLayout.cellWidth,
              }}
              tabIndex={0}
              title={tile.providerVariantStatus.title}
            >
              <div
                data-gtsx-frame-preview-frame={tile.name}
                data-gtsx-frame-preview-frame-state={componentCardPreviewFrameStateName(tile.frameState)}
                style={{
                  height: Math.ceil(tile.layoutHeight * frameGridLayout.previewScale),
                  overflow: "visible",
                  position: "relative",
                  width: Math.ceil(tile.layoutWidth * frameGridLayout.previewScale),
                }}
              >
                <div
                  data-gtsx-frame-preview-content={tile.name}
                  style={{
                    filter: tile.providerVariantStatus.state === "mismatch" ? "grayscale(0.9)" : undefined,
                    height: tile.layoutHeight,
                    left: 0,
                    opacity: tile.providerVariantStatus.state === "mismatch" ? 0.42 : undefined,
                    position: "absolute",
                    top: 0,
                    transform: `scale(${frameGridLayout.previewScale})`,
                    transformOrigin: "0 0",
                    width: tile.layoutWidth,
                  }}
                >
                  <LazyPreviewFrame
                    data-gtsx-preview-session-id={tile.sessionId}
                    boundaryRect={tile.visibleBoundaryRect}
                    coordinate={props.component.coordinate}
                    debugIndicatorScale={frameGridLayout.previewScale}
                    debugPreviewPool={props.debugPreviewPool}
                    debugPreviewQueue={props.debugPreviewQueue}
                    dimmed={tile.providerVariantStatus.state === "mismatch"}
                    frameState={tile.frameState}
                    onSelect={() => props.onSelect?.(props.component, effectiveFrameStatesByName, columnIndex, "pointer")}
                    onPreviewFrameMount={props.onPreviewFrameMount}
                    previewUrl={tile.previewUrl}
                    size={tile.displaySize}
                    sessionId={tile.sessionId}
                    title={`${props.component.componentName} ${tile.name} preview`}
                    viewportPreset={props.viewportPreset}
                  />
                  {tile.frameState?.error ? (
                    <div
                      style={{
                        inset: 0,
                        overflow: "auto",
                        position: "absolute",
                        zIndex: 2,
                      }}
                    >
                      <PreviewError
                        frameName={tile.name}
                        coordinate={props.component.coordinate}
                        error={tile.frameState.error}
                        previewUrl={tile.previewUrl}
                      />
                    </div>
                  ) : null}
                </div>
                {tile.providerVariantStatus.state === "mismatch" ? (
                  <div
                    aria-hidden="true"
                    data-gtsx-frame-provider-variant-border={tile.name}
                    style={{
                      border: `${studioCanvasScreenStableChromeBorderWidth()} dashed ${studioColors.mismatchBorder}`,
                      borderRadius: studioRadii.md,
                      inset: `-${studioComponentFrameMismatchBorderOutset}px`,
                      pointerEvents: "none",
                      position: "absolute",
                      zIndex: 6,
                    }}
                  />
                ) : null}
              </div>
              <span
                data-gtsx-canvas-screen-stable-chrome="frame-label"
                style={studioCanvasScreenStableChromeSlotStyle({
                  height: studioComponentFrameLabelMinHeight,
                  justifyItems: "center",
                  width: frameGridLayout.cellWidth,
                })}
              >
                <span
                  style={{
                    ...studioFrameLabelStyle(tile.providerVariantStatus.state === "mismatch"),
                    ...studioCanvasScreenStableChromeContentAfterCanvasGapStyle({
                      reservedCanvasGap: studioComponentFrameLabelGap,
                      screenGapBefore: studioComponentFrameLabelScreenGap,
                      transformOrigin: "top center",
                    }),
                    display: "block",
                  }}
                >
                  {tile.name}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

const ComponentCard = React.memo(ComponentCardView, areComponentCardPropsEqual) as typeof ComponentCardView & {
  frames?: GFrames<ComponentCardProps>
}

export default ComponentCard

ComponentCard.frames = {
  selectedReady: {
    props: {
      component: {
        coordinate: "src/UserCard.g.tsx#default",
        filePath: "src/UserCard.g.tsx",
        exportName: "default",
        componentName: "UserCard",
        mode: "scope",
        frames: [{ kind: "scope", name: "ready" }],
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
      frameStatesByName: {
        ready: {
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
      },
      manifest: {
        version: 1,
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        preview: {
          urlTemplate: "/gtsx?entry={entry}&frame={frame}{gframe}",
          allUrlTemplate: "/gtsx?entry={entry}{gframe}",
        },
        files: [],
        diagnostics: [],
      },
      selected: true,
      selectedFrameName: "ready",
      viewportPreset: "phone",
    },
  },
} satisfies GFrames<ComponentCardProps>

function areComponentCardPropsEqual(previous: ComponentCardProps, next: ComponentCardProps): boolean {
  if (
    previous.framePreviewScale !== next.framePreviewScale ||
    previous.columnIndex !== next.columnIndex ||
    previous.component !== next.component ||
    previous.debugPreviewPool !== next.debugPreviewPool ||
    previous.debugPreviewQueue !== next.debugPreviewQueue ||
    previous.frameState !== next.frameState ||
    previous.manifest !== next.manifest ||
    previous.onPreviewFrameMount !== next.onPreviewFrameMount ||
    previous.onSelect !== next.onSelect ||
    previous.providerVariantComponent !== next.providerVariantComponent ||
    !sameStudioProviderVariantContext(previous.providerVariantContext, next.providerVariantContext) ||
    previous.previewFrameOverrides !== next.previewFrameOverrides ||
    previous.selected !== next.selected ||
    previous.selectedFrameName !== next.selectedFrameName ||
    previous.viewportPreset !== next.viewportPreset
  ) {
    return false
  }

  for (const frame of next.component.frames) {
    if (!sameComponentCardFrameState(previous.frameStatesByName?.[frame.name], next.frameStatesByName?.[frame.name])) {
      return false
    }
    if (
      !sameComponentCardFrameState(
        previous.layoutFrameStatesByName?.[frame.name],
        next.layoutFrameStatesByName?.[frame.name],
      )
    ) {
      return false
    }
  }

  return true
}

function sameComponentCardFrameState(
  previous: ComponentCardFrameState | undefined,
  next: ComponentCardFrameState | undefined,
): boolean {
  return (
    previous === next ||
    (previous?.expectedSessionId === next?.expectedSessionId &&
      previous?.ready === next?.ready &&
      previous?.tree === next?.tree &&
      previous?.size?.height === next?.size?.height &&
      previous?.size?.width === next?.size?.width &&
      previous?.error?.message === next?.error?.message &&
      previous?.error?.stack === next?.error?.stack &&
      previous?.valuesByBoundaryId === next?.valuesByBoundaryId)
  )
}

function componentCardPreviewFrameStateName(frameState: ComponentCardFrameState | undefined): "error" | "ready" | "loading" {
  if (frameState?.error) return "error"
  if (frameState?.ready) return "ready"
  return "loading"
}

function boundaryRectForComponent(tree: ComponentCardFrameState["tree"], coordinate: string): GBoundaryRect | undefined {
  return studioBoundaryRectForCoordinate(tree, coordinate)
}

function getPreviewError(component: StudioManifestComponent): string | undefined {
  if (component.diagnostics.length > 0) {
    return component.diagnostics.map((diagnostic) => diagnostic.code).join(", ")
  }

  if (!component.frames[0]) {
    return "missing-frames"
  }

  return undefined
}
