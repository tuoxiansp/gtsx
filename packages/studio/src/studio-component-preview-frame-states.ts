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

export function studioComponentCaseLayoutFrameStates(
  component: StudioManifestComponent,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  previewGeometryStore?: StudioPreviewGeometryCacheStore,
): Record<string, StudioPreviewFrameState | undefined> {
  return Object.fromEntries(
    component.cases.map((testCase) => {
      const sessionId = previewSessionId(component, testCase.name, viewportPreset)
      const cacheKey = studioPreviewCacheKey(component, testCase.name, viewportPreset)
      return [
        testCase.name,
        previewGeometryStore
          ? previewGeometryStore.getLayoutFrameState(sessionId, cacheKey)
          : mergeStudioPreviewFrameState(sessionId, frameStates?.[sessionId], previewCache?.[cacheKey]?.frameState),
      ] as const
    }),
  )
}

export function studioComponentCaseFrameStates(
  component: StudioManifestComponent,
  viewportPreset: StudioViewportPreset,
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
  previewCache: Record<string, StudioPreviewCacheEntry> | undefined,
  previewGeometryStore?: StudioPreviewGeometryCacheStore,
): Record<string, StudioPreviewFrameState | undefined> {
  return Object.fromEntries(
    component.cases.map((testCase) => {
      const sessionId = previewSessionId(component, testCase.name, viewportPreset)
      const cacheKey = studioPreviewCacheKey(component, testCase.name, viewportPreset)
      return [
        testCase.name,
        previewGeometryStore
          ? previewGeometryStore.getMergedFrameState(sessionId, cacheKey)
          : mergeStudioPreviewFrameState(sessionId, frameStates?.[sessionId], previewCache?.[cacheKey]?.frameState),
      ] as const
    }),
  )
}
