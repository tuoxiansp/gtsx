"use client"

import React from "react"
import type { GBoundaryTreeNode } from "@gtsx/core"

import {
  type StudioPreviewFrameState,
  type StudioPreviewCacheEntry,
  type StudioProviderVariantContext,
  type StudioViewportPreset,
  sameStudioProviderVariantContext,
} from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import {
  studioPreviewGeometrySubscriptionKeys,
  type StudioPreviewGeometryCacheStore,
} from "../preview-geometry-cache-store"
import type { StudioPreviewIframeMountState } from "../preview-iframe-pool"
import {
  studioComponentFrameFrameStates,
  studioComponentFrameLayoutFrameStates,
} from "../studio-component-preview-frame-states"
import ComponentCard from "./ComponentCard.g"

type StudioComponentCardSlotProps = {
  framePreviewScale?: number
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
    frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
    columnIndex: number,
    source: "keyboard" | "pointer",
  ) => void
  previewGeometryStore?: StudioPreviewGeometryCacheStore
  providerVariantComponent?: StudioManifestComponent
  providerVariantContext?: StudioProviderVariantContext
  selected: boolean
  selectedFrameName: string
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
  const frameStatesByName = React.useMemo(
    () =>
      studioComponentFrameFrameStates(
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
  const layoutFrameStatesByName = React.useMemo(
    () =>
      studioComponentFrameLayoutFrameStates(
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
  const layoutSignature = studioComponentPreviewGeometrySignature(props.component, layoutFrameStatesByName)
  const handleSelect = React.useCallback(
    (
      component: StudioManifestComponent,
      frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
      columnIndex: number,
      source: "keyboard" | "pointer",
    ) => {
      onSelectRef.current(component, frameStatesByName, columnIndex, source)
    },
    [],
  )
  useStudioLayoutEffect(() => {
    onPreviewGeometryChangeRef.current?.()
  }, [layoutSignature])

  return (
    <ComponentCard
      frameStatesByName={frameStatesByName}
      layoutFrameStatesByName={layoutFrameStatesByName}
      framePreviewScale={props.framePreviewScale}
      columnIndex={props.columnIndex}
      component={props.component}
      debugPreviewPool={props.debugPreviewPool}
      debugPreviewQueue={props.debugPreviewQueue}
      manifest={props.manifest}
      onPreviewFrameMount={props.onPreviewFrameMount}
      onSelect={handleSelect}
      providerVariantComponent={props.providerVariantComponent}
      providerVariantContext={props.providerVariantContext}
      selected={props.selected}
      selectedFrameName={props.selectedFrameName}
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
    previous.framePreviewScale === next.framePreviewScale &&
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
    previous.providerVariantComponent === next.providerVariantComponent &&
    sameStudioProviderVariantContext(previous.providerVariantContext, next.providerVariantContext) &&
    previous.selected === next.selected &&
    previous.selectedFrameName === next.selectedFrameName &&
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
  frameStatesByName: Record<string, StudioPreviewFrameState | undefined>,
): string {
  return component.frames
    .map((frame) => `${frame.name}:${studioPreviewLayoutSignature(frameStatesByName[frame.name])}`)
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
