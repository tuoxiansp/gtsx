"use client"

import React from "react"
import type { GFrames } from "@runelight/react/runtime"
import type { GBoundaryRect } from "@runelight/core/boundary-rect"

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
  studioComponentCardWidth,
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
import type { StudioWorkspaceChangeFrameKind } from "../workspace-changes"
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
  studioFontFamily,
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

const componentCardUnknownFrameLayoutWidth = 280

type ComponentCardProps = {
  frameStatesByName?: Record<string, ComponentCardFrameState | undefined>
  layoutFrameStatesByName?: Record<string, ComponentCardFrameState | undefined>
  framePreviewScale?: number
  frameGridMaxSide?: number
  cardMinWidth?: number
  frameChangeStates?: Record<string, StudioWorkspaceChangeFrameKind>
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
  const layoutBoundaryRectFallback = componentCardLayoutBoundaryRectFallback(
    effectiveLayoutFrameStatesByName,
    props.component.coordinate,
  )
  const frameTiles = props.component.frames.map((frame) => {
    const frameState = effectiveFrameStatesByName[frame.name]
    const layoutFrameState = effectiveLayoutFrameStatesByName[frame.name]
    const sessionId = previewSessionId(props.component, frame.name, props.viewportPreset)
    const displaySize = studioPreviewFrameSize(props.viewportPreset, layoutFrameState?.size)
    const previewUrl = createStudioPreviewUrl(props.manifest, props.component, frame.name, sessionId, {
      frameOverrides: previewFrameOverrides,
      static: true,
    })
    const providerVariantStatus = studioProviderVariantFrameStatus(
      providerVariantComponent,
      frame,
      props.providerVariantContext,
    )
    const changeKind = props.frameChangeStates?.[frame.name]
    const boundaryRect = boundaryRectForComponent(layoutFrameState?.tree, props.component.coordinate)
    const layoutBoundaryRect = boundaryRect ?? layoutBoundaryRectFallback
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)
    const visibleLayoutBoundaryRect = clipPreviewBoundaryRectToViewport(layoutBoundaryRect, displaySize)
    const layoutSize = componentCardFrameLayoutSize(displaySize, visibleLayoutBoundaryRect)

    return {
      changeKind,
      displaySize,
      frameState,
      layoutHeight: layoutSize.height,
      layoutPending: !visibleLayoutBoundaryRect,
      layoutWidth: layoutSize.width,
      name: frame.name,
      previewUrl,
      providerVariantStatus,
      sessionId,
      visibleLayoutBoundaryRect,
      visibleBoundaryRect,
    }
  })
  const frameGridLayout = computeStudioFrameGridLayout({
    frameChromeHeight: studioComponentFrameChromeHeight,
    gap: studioComponentFrameGridGap,
    items: frameTiles.map((tile) => ({ height: tile.layoutHeight, width: tile.layoutWidth })),
    maxWidth: props.frameGridMaxSide,
    maxSide: props.frameGridMaxSide ?? studioFrameGridMaxSide(props.viewportPreset, frameTiles.length),
    minScale: studioComponentFrameGridMinScale,
    previewScale: props.framePreviewScale,
  })
  const cardWidth = studioComponentCardWidth(frameGridLayout.width, props.cardMinWidth)
  const columnIndex = props.columnIndex ?? 0
  const firstFrameName = props.component.frames[0]?.name ?? props.selectedFrameName

  return (
    <article
      aria-label={props.component.componentName}
      data-runelight-card-coordinate={props.component.coordinate}
      data-runelight-card-selected={props.selected ? "true" : undefined}
      style={{
        display: "grid",
        gap: 0,
        width: cardWidth,
      }}
    >
      <div
        data-runelight-canvas-screen-stable-chrome="card-title"
        style={studioCanvasScreenStableChromeSlotStyle({
          height: studioComponentCardTitleHeight + studioComponentCardTitleGap,
          width: cardWidth,
        })}
      >
        <span
          data-runelight-card-title-selected={props.selected ? "true" : undefined}
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
          data-runelight-frame-grid={props.component.coordinate}
          data-runelight-frame-grid-columns={frameGridLayout.columns}
          data-runelight-frame-grid-preview-scale={frameGridLayout.previewScale}
          data-runelight-frame-grid-selected={props.selected ? "true" : undefined}
          style={{
            display: "grid",
            gap: frameGridLayout.gap,
            gridTemplateColumns: `repeat(${frameGridLayout.columns}, ${frameGridLayout.cellWidth}px)`,
            position: "relative",
            width: frameGridLayout.width,
          }}
        >
          {frameTiles.map((tile) => {
            const scaledLayoutHeight = Math.ceil(tile.layoutHeight * frameGridLayout.previewScale)
            const scaledLayoutWidth = Math.ceil(tile.layoutWidth * frameGridLayout.previewScale)
            return (
              <div
                data-runelight-frame-provider-variant-state={tile.providerVariantStatus.state}
                data-runelight-frame-change-state={tile.changeKind}
                data-runelight-frame-tile={tile.name}
                key={tile.name}
                onClick={
                  props.onSelect
                    ? () => props.onSelect?.(props.component, effectiveFrameStatesByName, columnIndex, "pointer")
                    : undefined
                }
                onKeyDown={(event) => {
                  if (!props.onSelect) return
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  props.onSelect(props.component, effectiveFrameStatesByName, columnIndex, "keyboard")
                }}
                role={props.onSelect ? "button" : undefined}
                style={{
                  cursor: props.onSelect ? "pointer" : "grab",
                  display: "grid",
                  gap: studioComponentFrameLabelGap,
                  justifyItems: "center",
                  minWidth: 0,
                  width: frameGridLayout.cellWidth,
                }}
                tabIndex={props.onSelect ? 0 : undefined}
                title={tile.providerVariantStatus.title}
              >
                  <div
                    data-runelight-frame-preview-frame={tile.name}
                    data-runelight-frame-preview-frame-state={componentCardPreviewFrameStateName(tile.frameState)}
                    style={{
                      height: scaledLayoutHeight,
                      overflow: "visible",
                      position: "relative",
                      width: scaledLayoutWidth,
                    }}
                  >
                    <div
                      data-runelight-frame-preview-content={tile.name}
                      style={{
                        filter: componentCardFrameDimmed(tile.changeKind, tile.providerVariantStatus.state) ? "grayscale(0.9)" : undefined,
                        height: tile.layoutHeight,
                        left: 0,
                        opacity: componentCardFrameDimmed(tile.changeKind, tile.providerVariantStatus.state) ? 0.42 : undefined,
                        position: "absolute",
                        top: 0,
                        transform: `scale(${frameGridLayout.previewScale})`,
                        transformOrigin: "0 0",
                        width: tile.layoutWidth,
                      }}
                    >
                      <LazyPreviewFrame
                        data-runelight-preview-session-id={tile.sessionId}
                        boundaryRect={tile.visibleBoundaryRect}
                        coordinate={props.component.coordinate}
                        debugIndicatorScale={frameGridLayout.previewScale}
                        debugPreviewPool={props.debugPreviewPool}
                        debugPreviewQueue={props.debugPreviewQueue}
                        dimmed={componentCardFrameDimmed(tile.changeKind, tile.providerVariantStatus.state)}
                        frameState={tile.frameState}
                        layoutBoundaryRect={tile.visibleLayoutBoundaryRect}
                        layoutPending={tile.layoutPending}
                        layoutSize={{ height: tile.layoutHeight, width: tile.layoutWidth }}
                        onSelect={
                          props.onSelect
                            ? () => props.onSelect?.(props.component, effectiveFrameStatesByName, columnIndex, "pointer")
                            : undefined
                        }
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
                    {tile.changeKind === "deleted" ? (
                      <div
                        aria-hidden="true"
                        data-runelight-frame-change-deleted-overlay={tile.name}
                        style={{
                          alignItems: "center",
                          background: "rgba(18, 18, 18, 0.58)",
                          borderRadius: studioRadii.md,
                          color: studioColors.errorText,
                          display: "flex",
                          fontFamily: studioFontFamily,
                          fontSize: 10,
                          fontWeight: 800,
                          height: scaledLayoutHeight,
                          justifyContent: "center",
                          letterSpacing: 0,
                          left: 0,
                          pointerEvents: "none",
                          position: "absolute",
                          textTransform: "uppercase",
                          top: 0,
                          width: scaledLayoutWidth,
                          zIndex: 5,
                        }}
                      >
                        deleted
                      </div>
                    ) : null}
                    {tile.providerVariantStatus.state === "mismatch" || componentCardFrameChangeHasBorder(tile.changeKind) ? (
                      <div
                        aria-hidden="true"
                        data-runelight-frame-provider-variant-border={tile.providerVariantStatus.state === "mismatch" ? tile.name : undefined}
                        data-runelight-frame-change-border={tile.changeKind}
                        style={{
                          border: `${studioCanvasScreenStableChromeBorderWidth()} ${componentCardFrameChangeBorderStyle(tile.changeKind, tile.providerVariantStatus.state)}`,
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
                    data-runelight-canvas-screen-stable-chrome="frame-label"
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
                        alignItems: "center",
                        display: "flex",
                        gap: 5,
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {tile.name}
                      </span>
                      {componentCardFrameChangeBadgeLabel(tile.changeKind) ? (
                        <span
                          data-runelight-frame-change-badge={tile.changeKind}
                          style={{
                            background: componentCardFrameChangeBadgeBg(tile.changeKind),
                            border: `1px solid ${componentCardFrameChangeBorderColor(tile.changeKind)}`,
                            borderRadius: studioRadii.sm,
                            color: componentCardFrameChangeTextColor(tile.changeKind),
                            flexShrink: 0,
                            fontSize: 8,
                            fontWeight: 800,
                            lineHeight: 1,
                            padding: "2px 3px",
                            textTransform: "uppercase",
                          }}
                        >
                          {componentCardFrameChangeBadgeLabel(tile.changeKind)}
                        </span>
                      ) : null}
                    </span>
                  </span>
              </div>
            )
          })}
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
        sourceHash: "user-card-source",
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
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
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
    previous.frameGridMaxSide !== next.frameGridMaxSide ||
    previous.cardMinWidth !== next.cardMinWidth ||
    !sameComponentCardFrameChangeStates(previous.frameChangeStates, next.frameChangeStates) ||
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

function componentCardFrameDimmed(
  changeKind: StudioWorkspaceChangeFrameKind | undefined,
  providerVariantState: string,
): boolean {
  return providerVariantState === "mismatch" || changeKind === "deleted"
}

function componentCardFrameChangeHasBorder(changeKind: StudioWorkspaceChangeFrameKind | undefined): boolean {
  return changeKind === "added" || changeKind === "deleted" || changeKind === "changed" || changeKind === "unknown"
}

function componentCardFrameChangeBorderStyle(
  changeKind: StudioWorkspaceChangeFrameKind | undefined,
  providerVariantState: string,
): string {
  const style = changeKind === "deleted" || changeKind === "unknown" || providerVariantState === "mismatch" ? "dashed" : "solid"
  return `${style} ${componentCardFrameChangeBorderColor(providerVariantState === "mismatch" && !changeKind ? "unknown" : changeKind)}`
}

function componentCardFrameChangeBorderColor(changeKind: StudioWorkspaceChangeFrameKind | undefined): string {
  if (changeKind === "added") return "#4fa66a"
  if (changeKind === "deleted") return studioColors.errorBorder
  if (changeKind === "changed") return studioColors.accentBorder
  if (changeKind === "unknown") return studioColors.mismatchBorder
  return studioColors.mismatchBorder
}

function componentCardFrameChangeBadgeBg(changeKind: StudioWorkspaceChangeFrameKind | undefined): string {
  if (changeKind === "added") return "rgba(79,166,106,0.16)"
  if (changeKind === "deleted") return studioColors.errorBg
  if (changeKind === "changed") return studioColors.accentMuted
  return "rgba(136,136,136,0.16)"
}

function componentCardFrameChangeTextColor(changeKind: StudioWorkspaceChangeFrameKind | undefined): string {
  if (changeKind === "added") return "#9bd8ad"
  if (changeKind === "deleted") return studioColors.errorText
  if (changeKind === "changed") return studioColors.accentText
  return studioColors.textMuted
}

function componentCardFrameChangeBadgeLabel(changeKind: StudioWorkspaceChangeFrameKind | undefined): string | undefined {
  if (changeKind === "added") return "NEW"
  if (changeKind === "deleted") return "DEL"
  if (changeKind === "changed") return "CHG"
  if (changeKind === "unknown") return "?"
  return undefined
}

function sameComponentCardFrameChangeStates(
  previous: Record<string, StudioWorkspaceChangeFrameKind> | undefined,
  next: Record<string, StudioWorkspaceChangeFrameKind> | undefined,
): boolean {
  if (previous === next) return true
  const previousEntries = Object.entries(previous ?? {})
  const nextEntries = Object.entries(next ?? {})
  return previousEntries.length === nextEntries.length &&
    previousEntries.every(([key, value]) => next?.[key] === value)
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
      previous?.renderedSnapshot?.version === next?.renderedSnapshot?.version &&
      previous?.renderedSnapshot?.hash === next?.renderedSnapshot?.hash &&
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

function componentCardLayoutBoundaryRectFallback(
  frameStatesByName: Record<string, ComponentCardFrameState | undefined>,
  coordinate: string,
): GBoundaryRect | undefined {
  for (const frameState of Object.values(frameStatesByName)) {
    const boundaryRect = boundaryRectForComponent(frameState?.tree, coordinate)
    if (boundaryRect) return boundaryRect
  }

  return undefined
}

function componentCardFrameLayoutSize(
  displaySize: { width: number | string; height: number },
  boundaryRect: GBoundaryRect | undefined,
): { height: number; width: number } {
  if (!boundaryRect) {
    return {
      height: displaySize.height,
      width: componentCardUnknownFrameLayoutWidth,
    }
  }

  return {
    height: previewFrameLayoutHeight(displaySize, boundaryRect),
    width: Number(previewFrameLayoutWidth(displaySize, boundaryRect)),
  }
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
