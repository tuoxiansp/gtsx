"use client"

import type { GPreviewProtocolMessage } from "gtsx"

import type { StudioManifest, StudioManifestComponent } from "./manifest"
import {
  applyStudioPreviewMessage,
  mergeStudioPreviewFrameState,
  previewSessionId,
  studioPreviewCacheKey,
  type StudioPreviewCacheEntry,
  type StudioPreviewFrameState,
  type StudioPreviewTarget,
  type StudioViewportPreset,
} from "./client"
import { readStudioPreviewIndexedDBCache, writeStudioPreviewIndexedDBCache } from "./preview-cache-indexeddb"

export type StudioPreviewGeometryCacheMessage = {
  message: GPreviewProtocolMessage
  target: Pick<StudioPreviewTarget, "cacheKey">
}

export type StudioPreviewGeometryCacheUpdate = {
  changed: boolean
  entriesToWrite: Record<string, StudioPreviewCacheEntry | undefined>
  snapshot: Record<string, StudioPreviewCacheEntry>
}

export type StudioPreviewGeometryCacheStore = {
  cacheKeys: readonly string[]
  getFrameState: (sessionId: string) => StudioPreviewFrameState | undefined
  getLayoutFrameState: (sessionId: string, cacheKey: string) => StudioPreviewFrameState | undefined
  getMergedFrameState: (sessionId: string, cacheKey: string) => StudioPreviewFrameState | undefined
  getSnapshot: () => Record<string, StudioPreviewCacheEntry>
  getVersionForKeys: (keys: readonly string[]) => string
  hydrate: () => Promise<Record<string, StudioPreviewCacheEntry>>
  markSessionRenderStarted: (sessionId: string) => boolean
  namespace: string
  putMessages: (
    messages: readonly StudioPreviewGeometryCacheMessage[],
    activeSessionIds?: ReadonlySet<string>,
  ) => StudioPreviewGeometryCacheUpdate
  reset: (cache?: Record<string, StudioPreviewCacheEntry>) => void
  subscribe: (keys: readonly string[], listener: () => void) => () => void
  writeEntries: (entries: Record<string, StudioPreviewCacheEntry | undefined>) => Promise<void>
}

const studioPreviewGeometryViewportPresets: readonly StudioViewportPreset[] = ["phone", "tablet", "desktop"]

export function studioPreviewGeometryCacheKeys(manifest: StudioManifest): string[] {
  return uniqueStrings(
    manifest.files.flatMap((file) =>
      file.components.flatMap((component) =>
        component.cases.flatMap((testCase) =>
          studioPreviewGeometryViewportPresets.map((viewportPreset) =>
            studioPreviewCacheKey(component, testCase.name, viewportPreset),
          ),
        ),
      ),
    ),
  )
}

export function createStudioPreviewGeometryCacheStore(input: {
  cacheKeys: readonly string[]
  namespace: string
}): StudioPreviewGeometryCacheStore {
  const cacheKeys = uniqueStrings(input.cacheKeys)
  let cache: Record<string, StudioPreviewCacheEntry> = {}
  let frameStates: Record<string, StudioPreviewFrameState> = {}
  let layoutCache: Record<string, StudioPreviewCacheEntry> = {}
  const listenersByKey = new Map<string, Set<() => void>>()
  const versionByKey = new Map<string, number>()

  const notifyChangedKeys = (changedKeys: ReadonlySet<string>) => {
    if (changedKeys.size === 0) return

    const listeners = new Set<() => void>()
    for (const key of changedKeys) {
      versionByKey.set(key, (versionByKey.get(key) ?? 0) + 1)
      for (const listener of listenersByKey.get(key) ?? []) listeners.add(listener)
    }
    for (const listener of listeners) listener()
  }

  return {
    cacheKeys,
    getFrameState(sessionId) {
      return frameStates[sessionId]
    },
    getLayoutFrameState(sessionId, cacheKey) {
      const cachedLayoutFrameState = layoutCache[cacheKey]?.frameState
      if (cachedLayoutFrameState) return mergeStudioPreviewFrameState(sessionId, undefined, cachedLayoutFrameState)
      return frameStates[sessionId]
    },
    getMergedFrameState(sessionId, cacheKey) {
      return mergeStudioPreviewFrameState(sessionId, frameStates[sessionId], cache[cacheKey]?.frameState)
    },
    namespace: input.namespace,
    getSnapshot() {
      return cache
    },
    getVersionForKeys(keys) {
      return keys.map((key) => `${key}:${versionByKey.get(key) ?? 0}`).join("|")
    },
    async hydrate() {
      const nextCache = {
        ...(await readStudioPreviewIndexedDBCache(input.namespace, cacheKeys)),
        ...cache,
      }
      const changedKeys = changedPreviewCacheKeys(cache, nextCache)
      cache = nextCache
      layoutCache = nextCache
      notifyChangedKeys(changedKeys)
      return cache
    },
    markSessionRenderStarted(sessionId) {
      const currentFrameState = frameStates[sessionId]
      const nextFrameState: StudioPreviewFrameState = {
        expectedSessionId: sessionId,
        ready: false,
      }
      if (currentFrameState && sameStudioPreviewFrameState(currentFrameState, nextFrameState)) return false

      frameStates = {
        ...frameStates,
        [sessionId]: nextFrameState,
      }
      notifyChangedKeys(new Set([sessionId]))
      return true
    },
    putMessages(messages, activeSessionIds = new Set()) {
      const changedKeys = new Set<string>()
      const nextFrameStates = applyStudioPreviewMessagesToFrameStateStore(frameStates, messages, activeSessionIds, changedKeys)
      const nextCache = applyStudioPreviewMessagesToGeometryCache(cache, messages, changedKeys)
      const nextLayoutCache = applyStudioPreviewMessagesToLayoutCache(layoutCache, messages, changedKeys)
      if (nextFrameStates === frameStates && nextCache === cache && nextLayoutCache === layoutCache) {
        return { changed: false, entriesToWrite: {}, snapshot: cache }
      }

      frameStates = nextFrameStates
      cache = nextCache
      layoutCache = nextLayoutCache
      notifyChangedKeys(changedKeys)
      return {
        changed: true,
        entriesToWrite: previewGeometryCacheEntriesForMessages(cache, messages),
        snapshot: cache,
      }
    },
    reset(nextCache = {}) {
      const changedKeys = new Set([
        ...Object.keys(frameStates),
        ...changedPreviewCacheKeys(cache, nextCache),
        ...changedPreviewCacheKeys(layoutCache, nextCache),
      ])
      frameStates = {}
      cache = nextCache
      layoutCache = nextCache
      notifyChangedKeys(changedKeys)
    },
    subscribe(keys, listener) {
      for (const key of keys) {
        let listeners = listenersByKey.get(key)
        if (!listeners) {
          listeners = new Set()
          listenersByKey.set(key, listeners)
        }
        listeners.add(listener)
      }

      return () => {
        for (const key of keys) {
          const listeners = listenersByKey.get(key)
          if (!listeners) continue
          listeners.delete(listener)
          if (listeners.size === 0) listenersByKey.delete(key)
        }
      }
    },
    writeEntries(entries) {
      return writeStudioPreviewIndexedDBCache(input.namespace, entries)
    },
  }
}

export function studioPreviewGeometrySubscriptionKeys(input: {
  component: StudioManifestComponent
  viewportPreset: StudioViewportPreset
}): string[] {
  return input.component.cases.flatMap((testCase) => {
    const sessionId = previewSessionId(input.component, testCase.name, input.viewportPreset)
    const cacheKey = studioPreviewCacheKey(input.component, testCase.name, input.viewportPreset)
    return [sessionId, cacheKey]
  })
}

function applyStudioPreviewMessagesToFrameStateStore(
  current: Record<string, StudioPreviewFrameState>,
  messages: readonly StudioPreviewGeometryCacheMessage[],
  activeSessionIds: ReadonlySet<string>,
  changedKeys: Set<string>,
): Record<string, StudioPreviewFrameState> {
  let next = current

  for (const { message } of messages) {
    if (!activeSessionIds.has(message.sessionId)) continue
    const currentFrameState = next[message.sessionId] ?? {
      expectedSessionId: message.sessionId,
      ready: false,
    }
    const nextFrameState = applyStudioPreviewMessage(currentFrameState, message)
    if (nextFrameState === currentFrameState) continue
    if (next === current) next = { ...current }
    next[message.sessionId] = nextFrameState
    changedKeys.add(message.sessionId)
  }

  return next
}

function applyStudioPreviewMessagesToGeometryCache(
  current: Record<string, StudioPreviewCacheEntry>,
  messages: readonly StudioPreviewGeometryCacheMessage[],
  changedKeys: Set<string>,
): Record<string, StudioPreviewCacheEntry> {
  const now = Date.now()
  let next = current

  for (const { message, target } of messages) {
    const currentEntry = next[target.cacheKey]
    const currentFrameState: StudioPreviewFrameState = currentEntry?.frameState ?? {
      expectedSessionId: message.sessionId,
      ready: false,
    }
    const nextFrameState = applyStudioPreviewMessage(currentFrameState, message)
    if (nextFrameState === currentFrameState) continue
    if (next === current) next = { ...current }
    next[target.cacheKey] = {
      frameState: nextFrameState,
      lastUsedAt: now,
    }
    changedKeys.add(target.cacheKey)
  }

  return next
}

function applyStudioPreviewMessagesToLayoutCache(
  current: Record<string, StudioPreviewCacheEntry>,
  messages: readonly StudioPreviewGeometryCacheMessage[],
  changedKeys: Set<string>,
): Record<string, StudioPreviewCacheEntry> {
  const now = Date.now()
  let next = current

  for (const { message, target } of messages) {
    const currentEntry = next[target.cacheKey]
    if (!shouldUpdateLayoutCacheEntry(currentEntry)) continue

    const currentFrameState: StudioPreviewFrameState = currentEntry?.frameState ?? {
      expectedSessionId: message.sessionId,
      ready: false,
    }
    const nextFrameState = applyStudioPreviewMessage(currentFrameState, message)
    if (nextFrameState === currentFrameState) continue
    if (next === current) next = { ...current }
    next[target.cacheKey] = {
      frameState: nextFrameState,
      lastUsedAt: now,
    }
    changedKeys.add(target.cacheKey)
  }

  return next
}

function previewGeometryCacheEntriesForMessages(
  cache: Record<string, StudioPreviewCacheEntry>,
  messages: readonly StudioPreviewGeometryCacheMessage[],
): Record<string, StudioPreviewCacheEntry | undefined> {
  const entries: Record<string, StudioPreviewCacheEntry | undefined> = {}
  for (const { target } of messages) entries[target.cacheKey] = cache[target.cacheKey]
  return entries
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function changedPreviewCacheKeys(
  previous: Record<string, StudioPreviewCacheEntry>,
  next: Record<string, StudioPreviewCacheEntry>,
): Set<string> {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  const changedKeys = new Set<string>()

  for (const key of keys) {
    if (previous[key] !== next[key]) changedKeys.add(key)
  }

  return changedKeys
}

function shouldUpdateLayoutCacheEntry(entry: StudioPreviewCacheEntry | undefined): boolean {
  return !entry?.frameState.tree && !entry?.frameState.error
}

function sameStudioPreviewFrameState(left: StudioPreviewFrameState, right: StudioPreviewFrameState): boolean {
  return (
    left.expectedSessionId === right.expectedSessionId &&
    left.ready === right.ready &&
    left.tree === right.tree &&
    left.size === right.size &&
    left.error === right.error &&
    left.valuesByBoundaryId === right.valuesByBoundaryId
  )
}
