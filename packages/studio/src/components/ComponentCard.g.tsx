"use client"

import React from "react"
import type { GBoundaryRect, GCases } from "@gtsx/core"

import {
  clipPreviewBoundaryRectToViewport,
  computeStudioCaseGridLayout,
  createStudioPreviewUrl,
  previewSessionId,
  studioPreviewCaseOverridesForProviderVariantContext,
  studioPreviewFrameSize,
  studioProviderVariantCaseStatus,
  sameStudioProviderVariantContext,
  type StudioPreviewCaseOverride,
  type StudioProviderVariantContext,
  type StudioPreviewFrameState,
} from "../client"
import {
  studioCaseGridMaxSide,
  studioComponentCardTitleGap,
  studioComponentCardTitleHeight,
  studioComponentCardTitleScreenGap,
  studioComponentCardTitleScreenHeight,
  studioComponentCaseChromeHeight,
  studioComponentCaseGridGap,
  studioComponentCaseLabelGap,
  studioComponentCaseLabelMinHeight,
  studioComponentCaseLabelScreenGap,
  studioComponentCaseGridMinScale,
  studioComponentCaseMismatchBorderOutset,
} from "../case-grid-layout"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { previewFrameLayoutHeight, previewFrameLayoutWidth } from "../preview-frame-layout"
import { studioBoundaryRectForCoordinate } from "../boundary-tree"
import LazyPreviewFrame from "./LazyPreviewFrame.g"
import PreviewError from "./PreviewError.g"
import {
  studioCaseLabelStyle,
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
  caseFrameStates?: Record<string, ComponentCardFrameState | undefined>
  caseLayoutFrameStates?: Record<string, ComponentCardFrameState | undefined>
  casePreviewScale?: number
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
    caseFrameStates: Record<string, ComponentCardFrameState | undefined>,
    columnIndex: number,
    source: StudioCardSelectionSource,
  ) => void
  providerVariantComponent?: StudioManifestComponent
  providerVariantContext?: StudioProviderVariantContext
  previewCaseOverrides?: readonly StudioPreviewCaseOverride[]
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
}

function ComponentCardView(props: ComponentCardProps) {
  const previewError = getPreviewError(props.component)
  const providerVariantComponent = props.providerVariantComponent ?? props.component
  const previewCaseOverrides =
    props.previewCaseOverrides ??
    studioPreviewCaseOverridesForProviderVariantContext(props.manifest, props.providerVariantContext ?? {})
  const effectiveCaseFrameStates = Object.fromEntries(
    props.component.cases.map((testCase) => [
      testCase.name,
      props.caseFrameStates?.[testCase.name] ?? (testCase.name === props.selectedCaseName ? props.frameState : undefined),
    ]),
  ) as Record<string, ComponentCardFrameState | undefined>
  const effectiveCaseLayoutFrameStates = Object.fromEntries(
    props.component.cases.map((testCase) => [
      testCase.name,
      props.caseLayoutFrameStates?.[testCase.name] ?? effectiveCaseFrameStates[testCase.name],
    ]),
  ) as Record<string, ComponentCardFrameState | undefined>
  const caseTiles = props.component.cases.map((testCase) => {
    const frameState = effectiveCaseFrameStates[testCase.name]
    const layoutFrameState = effectiveCaseLayoutFrameStates[testCase.name]
    const sessionId = previewSessionId(props.component, testCase.name, props.viewportPreset)
    const displaySize = studioPreviewFrameSize(props.viewportPreset, layoutFrameState?.size)
    const previewUrl = createStudioPreviewUrl(props.manifest, props.component, testCase.name, sessionId, {
      caseOverrides: previewCaseOverrides,
      static: true,
    })
    const boundaryRect = boundaryRectForComponent(layoutFrameState?.tree, props.component.coordinate)
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)
    const layoutWidth = Number(previewFrameLayoutWidth(displaySize, visibleBoundaryRect))
    const layoutHeight = previewFrameLayoutHeight(displaySize, visibleBoundaryRect)
    const providerVariantStatus = studioProviderVariantCaseStatus(
      providerVariantComponent,
      testCase,
      props.providerVariantContext,
    )

    return {
      displaySize,
      frameState,
      layoutHeight,
      layoutWidth,
      name: testCase.name,
      previewUrl,
      providerVariantStatus,
      sessionId,
      visibleBoundaryRect,
    }
  })
  const caseGridLayout = computeStudioCaseGridLayout({
    caseChromeHeight: studioComponentCaseChromeHeight,
    gap: studioComponentCaseGridGap,
    items: caseTiles.map((tile) => ({ height: tile.layoutHeight, width: tile.layoutWidth })),
    maxSide: studioCaseGridMaxSide(props.viewportPreset, caseTiles.length),
    minScale: studioComponentCaseGridMinScale,
    previewScale: props.casePreviewScale,
  })
  const cardWidth = Math.max(280, caseGridLayout.width)
  const columnIndex = props.columnIndex ?? 0
  const firstCaseName = props.component.cases[0]?.name ?? props.selectedCaseName

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
          caseName={firstCaseName}
          coordinate={props.component.coordinate}
          error={{ message: previewError }}
          previewUrl={createStudioPreviewUrl(props.manifest, props.component, firstCaseName, undefined, { static: true })}
        />
      ) : (
        <div
          data-gtsx-case-grid={props.component.coordinate}
          data-gtsx-case-grid-columns={caseGridLayout.columns}
          data-gtsx-case-grid-preview-scale={caseGridLayout.previewScale}
          data-gtsx-case-grid-selected={props.selected ? "true" : undefined}
          style={{
            display: "grid",
            gap: caseGridLayout.gap,
            gridTemplateColumns: `repeat(${caseGridLayout.columns}, ${caseGridLayout.cellWidth}px)`,
            position: "relative",
            width: caseGridLayout.width,
          }}
        >
          {caseTiles.map((tile) => (
            <div
              data-gtsx-case-provider-variant-state={tile.providerVariantStatus.state}
              data-gtsx-case-tile={tile.name}
              key={tile.name}
              onClick={() => props.onSelect?.(props.component, effectiveCaseFrameStates, columnIndex, "pointer")}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                props.onSelect?.(props.component, effectiveCaseFrameStates, columnIndex, "keyboard")
              }}
              onPointerDown={(event) => event.stopPropagation()}
              role="button"
              style={{
                cursor: props.onSelect ? "pointer" : "default",
                display: "grid",
                gap: studioComponentCaseLabelGap,
                justifyItems: "center",
                minWidth: 0,
                width: caseGridLayout.cellWidth,
              }}
              tabIndex={0}
              title={tile.providerVariantStatus.title}
            >
              <div
                data-gtsx-case-preview-frame={tile.name}
                data-gtsx-case-preview-frame-state={componentCardPreviewFrameStateName(tile.frameState)}
                style={{
                  height: Math.ceil(tile.layoutHeight * caseGridLayout.previewScale),
                  overflow: "visible",
                  position: "relative",
                  width: Math.ceil(tile.layoutWidth * caseGridLayout.previewScale),
                }}
              >
                <div
                  data-gtsx-case-preview-content={tile.name}
                  style={{
                    filter: tile.providerVariantStatus.state === "mismatch" ? "grayscale(0.9)" : undefined,
                    height: tile.layoutHeight,
                    left: 0,
                    opacity: tile.providerVariantStatus.state === "mismatch" ? 0.42 : undefined,
                    position: "absolute",
                    top: 0,
                    transform: `scale(${caseGridLayout.previewScale})`,
                    transformOrigin: "0 0",
                    width: tile.layoutWidth,
                  }}
                >
                  <LazyPreviewFrame
                    data-gtsx-preview-session-id={tile.sessionId}
                    boundaryRect={tile.visibleBoundaryRect}
                    coordinate={props.component.coordinate}
                    debugIndicatorScale={caseGridLayout.previewScale}
                    debugPreviewPool={props.debugPreviewPool}
                    debugPreviewQueue={props.debugPreviewQueue}
                    dimmed={tile.providerVariantStatus.state === "mismatch"}
                    frameState={tile.frameState}
                    onSelect={() => props.onSelect?.(props.component, effectiveCaseFrameStates, columnIndex, "pointer")}
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
                        caseName={tile.name}
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
                    data-gtsx-case-provider-variant-border={tile.name}
                    style={{
                      border: `${studioCanvasScreenStableChromeBorderWidth()} dashed ${studioColors.mismatchBorder}`,
                      borderRadius: studioRadii.md,
                      inset: `-${studioComponentCaseMismatchBorderOutset}px`,
                      pointerEvents: "none",
                      position: "absolute",
                      zIndex: 6,
                    }}
                  />
                ) : null}
              </div>
              <span
                data-gtsx-canvas-screen-stable-chrome="case-label"
                style={studioCanvasScreenStableChromeSlotStyle({
                  height: studioComponentCaseLabelMinHeight,
                  justifyItems: "center",
                  width: caseGridLayout.cellWidth,
                })}
              >
                <span
                  style={{
                    ...studioCaseLabelStyle(tile.providerVariantStatus.state === "mismatch"),
                    ...studioCanvasScreenStableChromeContentAfterCanvasGapStyle({
                      reservedCanvasGap: studioComponentCaseLabelGap,
                      screenGapBefore: studioComponentCaseLabelScreenGap,
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
  cases?: GCases<ComponentCardProps>
}

export default ComponentCard

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
      caseFrameStates: {
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

function areComponentCardPropsEqual(previous: ComponentCardProps, next: ComponentCardProps): boolean {
  if (
    previous.casePreviewScale !== next.casePreviewScale ||
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
    previous.previewCaseOverrides !== next.previewCaseOverrides ||
    previous.selected !== next.selected ||
    previous.selectedCaseName !== next.selectedCaseName ||
    previous.viewportPreset !== next.viewportPreset
  ) {
    return false
  }

  for (const testCase of next.component.cases) {
    if (!sameComponentCardFrameState(previous.caseFrameStates?.[testCase.name], next.caseFrameStates?.[testCase.name])) {
      return false
    }
    if (
      !sameComponentCardFrameState(
        previous.caseLayoutFrameStates?.[testCase.name],
        next.caseLayoutFrameStates?.[testCase.name],
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

  if (!component.cases[0]) {
    return "missing-case"
  }

  return undefined
}
