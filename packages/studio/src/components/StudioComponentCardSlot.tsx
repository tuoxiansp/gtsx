"use client"

import React from "react"
import type { GBoundaryTreeNode } from "@gtsx/core"

import {
  type StudioPreviewFrameState,
  type StudioPreviewCacheEntry,
  type StudioViewportPreset,
} from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  studioPreviewGeometrySubscriptionKeys,
  type StudioPreviewGeometryCacheStore,
} from "../preview-geometry-cache-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import {
  studioComponentCaseFrameStates,
  studioComponentCaseLayoutFrameStates,
} from "../studio-component-preview-frame-states"
import ComponentCard from "./ComponentCard.g"

type StudioComponentCardSlotProps = {
  casePreviewScale?: number
  columnIndex: number
  component: StudioManifestComponent
  debugPreviewPool?: boolean
  debugPreviewQueue?: boolean
  fallbackFrameStates?: Record<string, StudioPreviewFrameState>
  fallbackPreviewCache?: Record<string, StudioPreviewCacheEntry>
  manifest: StudioManifest
  onPreviewFrameMount?: (
    sessionId: string,
    frame: HTMLIFrameElement | null,
    state?: StudioPreviewIframeMountState,
  ) => void
  onPreviewGeometryChange?: () => void
  onSelect: (
    component: StudioManifestComponent,
    caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
    columnIndex: number,
    source: "keyboard" | "pointer",
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  selected: boolean
  selectedCaseName: string
  viewportPreset: StudioViewportPreset
}

const useStudioLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

function StudioComponentCardSlotView(props: StudioComponentCardSlotProps) {
  const onPreviewGeometryChangeRef = React.useRef(props.onPreviewGeometryChange)
  const onSelectRef = React.useRef(props.onSelect)
  onPreviewGeometryChangeRef.current = props.onPreviewGeometryChange
  onSelectRef.current = props.onSelect
  const previewGeometryStoreVersion = useStudioComponentPreviewGeometryVersion({
    component: props.component,
    previewGeometryStore: props.previewGeometryStore,
    viewportPreset: props.viewportPreset,
  })
  const caseFrameStates = React.useMemo(
    () =>
      studioComponentCaseFrameStates(
        props.component,
        props.viewportPreset,
        props.fallbackFrameStates,
        props.fallbackPreviewCache,
        props.previewGeometryStore,
      ),
    [
      props.component,
      props.fallbackFrameStates,
      props.fallbackPreviewCache,
      props.previewGeometryStore,
      props.viewportPreset,
      previewGeometryStoreVersion,
    ],
  )
  const caseLayoutFrameStates = React.useMemo(
    () =>
      studioComponentCaseLayoutFrameStates(
        props.component,
        props.viewportPreset,
        props.fallbackFrameStates,
        props.fallbackPreviewCache,
        props.previewGeometryStore,
      ),
    [
      props.component,
      props.fallbackFrameStates,
      props.fallbackPreviewCache,
      props.previewGeometryStore,
      props.viewportPreset,
      previewGeometryStoreVersion,
    ],
  )
  const layoutSignature = studioComponentPreviewGeometrySignature(props.component, caseLayoutFrameStates)
  const handleSelect = React.useCallback(
    (
      component: StudioManifestComponent,
      caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
      columnIndex: number,
      source: "keyboard" | "pointer",
    ) => {
      onSelectRef.current(component, caseFrameStates, columnIndex, source)
    },
    [],
  )

  useStudioLayoutEffect(() => {
    onPreviewGeometryChangeRef.current?.()
  }, [layoutSignature])

  return (
    <ComponentCard
      caseFrameStates={caseFrameStates}
      caseLayoutFrameStates={caseLayoutFrameStates}
      casePreviewScale={props.casePreviewScale}
      columnIndex={props.columnIndex}
      component={props.component}
      debugPreviewPool={props.debugPreviewPool}
      debugPreviewQueue={props.debugPreviewQueue}
      manifest={props.manifest}
      onPreviewFrameMount={props.onPreviewFrameMount}
      onSelect={handleSelect}
      selected={props.selected}
      selectedCaseName={props.selectedCaseName}
      viewportPreset={props.viewportPreset}
    />
  )
}

const StudioComponentCardSlot = React.memo(StudioComponentCardSlotView, areStudioComponentCardSlotPropsEqual)

export default StudioComponentCardSlot

function areStudioComponentCardSlotPropsEqual(
  previous: StudioComponentCardSlotProps,
  next: StudioComponentCardSlotProps,
): boolean {
  return (
    previous.casePreviewScale === next.casePreviewScale &&
    previous.columnIndex === next.columnIndex &&
    previous.component === next.component &&
    previous.debugPreviewPool === next.debugPreviewPool &&
    previous.debugPreviewQueue === next.debugPreviewQueue &&
    previous.fallbackFrameStates === next.fallbackFrameStates &&
    previous.fallbackPreviewCache === next.fallbackPreviewCache &&
    previous.manifest === next.manifest &&
    previous.onPreviewGeometryChange === next.onPreviewGeometryChange &&
    previous.onPreviewFrameMount === next.onPreviewFrameMount &&
    previous.onSelect === next.onSelect &&
    previous.previewGeometryStore === next.previewGeometryStore &&
    previous.selected === next.selected &&
    previous.selectedCaseName === next.selectedCaseName &&
    previous.viewportPreset === next.viewportPreset
  )
}

function useStudioComponentPreviewGeometryVersion(input: {
  component: StudioManifestComponent
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  viewportPreset: StudioViewportPreset
}): string {
  const subscriptionKeys = React.useMemo(
    () =>
      input.previewGeometryStore
        ? studioPreviewGeometrySubscriptionKeys({
            component: input.component,
            viewportPreset: input.viewportPreset,
          })
        : [],
    [input.component, input.previewGeometryStore, input.viewportPreset],
  )

  return React.useSyncExternalStore(
    React.useCallback(
      (listener) => input.previewGeometryStore?.subscribe(subscriptionKeys, listener) ?? (() => {}),
      [input.previewGeometryStore, subscriptionKeys],
    ),
    React.useCallback(
      () => input.previewGeometryStore?.getVersionForKeys(subscriptionKeys) ?? "",
      [input.previewGeometryStore, subscriptionKeys],
    ),
    () => "",
  )
}

function studioComponentPreviewGeometrySignature(
  component: StudioManifestComponent,
  caseFrameStates: Record<string, StudioPreviewFrameState | undefined>,
): string {
  return component.cases
    .map((testCase) => `${testCase.name}:${studioPreviewLayoutSignature(caseFrameStates[testCase.name])}`)
    .join("|")
}

function studioPreviewLayoutSignature(frameState: StudioPreviewFrameState | undefined): string {
  if (!frameState) return "pending"
  const size = frameState.size ? `${frameState.size.width}x${frameState.size.height}` : "-"
  return `${size}:${boundaryTreeLayoutSignature(frameState.tree)}`
}

function boundaryTreeLayoutSignature(tree: StudioPreviewFrameState["tree"]): string {
  if (!tree) return "-"
  const parts: string[] = []
  const visit = (node: GBoundaryTreeNode) => {
    const rect = node.rect ? `${node.rect.x},${node.rect.y},${node.rect.width},${node.rect.height}` : "-"
    parts.push(`${node.coordinate}@${rect}`)
    for (const child of node.children) visit(child)
  }
  for (const node of tree) visit(node)
  return parts.join(";")
}
