"use client"

import React from "react"
import type { GBoundaryRect, GBoundaryTreeNode, GCases } from "@gtsx/core"

import {
  clipPreviewBoundaryRectToViewport,
  computeStudioCaseGridLayout,
  createStudioPreviewUrl,
  previewSessionId,
  studioPreviewFrameSize,
  type StudioPreviewFrameState,
} from "../client"
import {
  studioCaseGridMaxSide,
  studioComponentCaseChromeHeight,
  studioComponentCaseGridGap,
  studioComponentCaseGridMinScale,
} from "../case-grid-layout"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import { previewFrameLayoutHeight, previewFrameLayoutWidth } from "../preview-frame-layout"
import LazyPreviewFrame from "./LazyPreviewFrame.g"
import PreviewError from "./PreviewError.g"

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
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
}

function ComponentCardView(props: ComponentCardProps) {
  const previewError = getPreviewError(props.component)
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
    const previewUrl = createStudioPreviewUrl(props.manifest, props.component, testCase.name, sessionId, { static: true })
    const boundaryRect = boundaryRectForComponent(layoutFrameState?.tree, props.component.coordinate)
    const visibleBoundaryRect = clipPreviewBoundaryRectToViewport(boundaryRect, displaySize)
    const layoutWidth = Number(previewFrameLayoutWidth(displaySize, visibleBoundaryRect))
    const layoutHeight = previewFrameLayoutHeight(displaySize, visibleBoundaryRect)

    return {
      displaySize,
      frameState,
      layoutHeight,
      layoutWidth,
      name: testCase.name,
      previewUrl,
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
        gap: 8,
        width: cardWidth,
      }}
    >
      <strong
        style={{
          color: "inherit",
          fontSize: 13,
          letterSpacing: 0,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {props.component.componentName}
      </strong>
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
            outline: props.selected ? "1px solid #0d99ff" : undefined,
            position: "relative",
            width: caseGridLayout.width,
          }}
        >
          {caseTiles.map((tile) => (
            <div
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
                alignContent: "start",
                cursor: props.onSelect ? "pointer" : "default",
                display: "grid",
                gap: 5,
                minWidth: 0,
                width: caseGridLayout.cellWidth,
              }}
              tabIndex={0}
            >
              <strong
                style={{
                  color: "#57606a",
                  fontSize: 11,
                  lineHeight: `${studioComponentCaseChromeHeight - 5}px`,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tile.name}
              </strong>
              <div
                data-gtsx-case-preview-frame={tile.name}
                data-gtsx-case-preview-frame-state={componentCardPreviewFrameStateName(tile.frameState)}
                style={{
                  height: Math.ceil(tile.layoutHeight * caseGridLayout.previewScale),
                  justifySelf: "center",
                  overflow: "visible",
                  position: "relative",
                  width: Math.ceil(tile.layoutWidth * caseGridLayout.previewScale),
                }}
              >
                <div
                  style={{
                    height: tile.layoutHeight,
                    left: 0,
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
              </div>
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

function boundaryRectForComponent(tree: GBoundaryTreeNode[] | undefined, coordinate: string): GBoundaryRect | undefined {
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
