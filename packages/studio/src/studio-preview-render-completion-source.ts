import type { StudioPreviewFrameState } from "./client"
import type { StudioPreviewGeometryCacheStore } from "./preview-geometry-cache-store"

export type StudioPreviewRenderCompletionSource = {
  completedSessionIdsFor: (sessionIds: ReadonlySet<string>) => Set<string>
}

export function createStudioPreviewRenderCompletionSource(input: {
  frameStates: Record<string, StudioPreviewFrameState> | undefined
  previewGeometryStore: StudioPreviewGeometryCacheStore | undefined
}): StudioPreviewRenderCompletionSource {
  if (input.previewGeometryStore) return createStudioPreviewRenderCompletionSourceFromGeometryStore(input.previewGeometryStore)
  return createStudioPreviewRenderCompletionSourceFromFrameStates(input.frameStates)
}

export function createStudioPreviewRenderCompletionSourceFromFrameStates(
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
): StudioPreviewRenderCompletionSource {
  const completedSessionIds = completedStudioPreviewSessionIdsFromFrameStates(frameStates)

  return {
    completedSessionIdsFor() {
      return new Set(completedSessionIds)
    },
  }
}

export function createStudioPreviewRenderCompletionSourceFromGeometryStore(
  previewGeometryStore: StudioPreviewGeometryCacheStore,
): StudioPreviewRenderCompletionSource {
  return {
    completedSessionIdsFor(sessionIds) {
      return completedStudioPreviewSessionIdsFromGeometryStore(previewGeometryStore, sessionIds)
    },
  }
}

function completedStudioPreviewSessionIdsFromFrameStates(
  frameStates: Record<string, StudioPreviewFrameState> | undefined,
): Set<string> {
  const sessionIds = new Set<string>()
  if (!frameStates) return sessionIds

  for (const [sessionId, frameState] of Object.entries(frameStates)) {
    if (frameState.ready || frameState.error) sessionIds.add(sessionId)
  }

  return sessionIds
}

function completedStudioPreviewSessionIdsFromGeometryStore(
  previewGeometryStore: StudioPreviewGeometryCacheStore,
  sessionIds: ReadonlySet<string>,
): Set<string> {
  const completedSessionIds = new Set<string>()
  for (const sessionId of sessionIds) {
    const frameState = previewGeometryStore.getFrameState(sessionId)
    if (frameState?.ready || frameState?.error) completedSessionIds.add(sessionId)
  }
  return completedSessionIds
}
