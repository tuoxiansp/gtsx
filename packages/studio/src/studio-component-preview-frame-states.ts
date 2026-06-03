"use client"

import {
  mergeStudioPreviewFrameState,
  previewSessionId,
  studioPreviewCacheKey,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioViewportPreset,
} from "./client"
import type { StudioManifestComponent } from "./manifest"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"

export function studioComponentFrameLayoutFrameStates(
  component: StudioManifestComponent,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  previewGeometryStore?: StudioPreviewGeometryCacheStore,
): Record<string, StudioPreviewFrameState | undefined> {
  return Object.fromEntries(
    component.frames.map((frame) => {
      const sessionId = previewSessionId(component, frame.name, viewportPreset)
      const cacheKey = studioPreviewCacheKey(component, frame.name, viewportPreset)
      return [
        frame.name,
        previewGeometryStore
          ? previewGeometryStore.getLayoutFrameState(sessionId, cacheKey)
          : mergeStudioPreviewFrameState(sessionId, frameStates?.[sessionId], previewCache?.[cacheKey]?.frameState),
      ] as const
    }),
  )
}

export function studioComponentFrameFrameStates(
  component: StudioManifestComponent,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  previewGeometryStore?: StudioPreviewGeometryCacheStore,
): Record<string, StudioPreviewFrameState | undefined> {
  return Object.fromEntries(
    component.frames.map((frame) => {
      const sessionId = previewSessionId(component, frame.name, viewportPreset)
      const cacheKey = studioPreviewCacheKey(component, frame.name, viewportPreset)
      return [
        frame.name,
        previewGeometryStore
          ? previewGeometryStore.getMergedFrameState(sessionId, cacheKey)
          : mergeStudioPreviewFrameState(sessionId, frameStates?.[sessionId], previewCache?.[cacheKey]?.frameState),
      ] as const
    }),
  )
}
