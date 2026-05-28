"use client"

import React from "react"

export type StudioPreviewRenderSessionStore = {
  getSessionIds: () => ReadonlySet<string>
  hasSessionId: (sessionId: string) => boolean
  isVisibleSessionId: (sessionId: string) => boolean
  setSessionIds: (sessionIds: ReadonlySet<string>, visibleSessionIds?: ReadonlySet<string>) => boolean
  subscribeToRenderSession: (sessionId: string, listener: () => void) => () => void
  subscribeToVisibleSession: (sessionId: string, listener: () => void) => () => void
}

const StudioPreviewRenderSessionStoreContext = React.createContext<StudioPreviewRenderSessionStore | null>(null)

export function createStudioPreviewRenderSessionStore(
  initialSessionIds: ReadonlySet<string> = new Set(),
): StudioPreviewRenderSessionStore {
  let sessionIds = new Set(initialSessionIds)
  let visibleSessionIds = new Set<string>()
  const renderSessionListenersBySessionId = new Map<string, Set<() => void>>()
  const visibleSessionListenersBySessionId = new Map<string, Set<() => void>>()

  const notifyListenersForSessionId = (listenersBySessionId: Map<string, Set<() => void>>, sessionId: string) => {
    const listeners = listenersBySessionId.get(sessionId)
    if (!listeners) return
    for (const listener of listeners) listener()
  }

  return {
    getSessionIds() {
      return sessionIds
    },
    hasSessionId(sessionId) {
      return sessionIds.has(sessionId)
    },
    isVisibleSessionId(sessionId) {
      return visibleSessionIds.has(sessionId)
    },
    setSessionIds(nextSessionIds, nextVisibleSessionIds = new Set()) {
      if (sameStringSet(sessionIds, nextSessionIds) && sameStringSet(visibleSessionIds, nextVisibleSessionIds)) return false

      const previousSessionIds = sessionIds
      const previousVisibleSessionIds = visibleSessionIds
      sessionIds = new Set(nextSessionIds)
      visibleSessionIds = new Set(nextVisibleSessionIds)

      const changedRenderSessionIds = new Set<string>()
      for (const sessionId of previousSessionIds) {
        if (!sessionIds.has(sessionId)) changedRenderSessionIds.add(sessionId)
      }
      for (const sessionId of sessionIds) {
        if (!previousSessionIds.has(sessionId)) changedRenderSessionIds.add(sessionId)
      }

      const changedVisibleSessionIds = new Set<string>()
      for (const sessionId of previousVisibleSessionIds) {
        if (!visibleSessionIds.has(sessionId)) changedVisibleSessionIds.add(sessionId)
      }
      for (const sessionId of visibleSessionIds) {
        if (!previousVisibleSessionIds.has(sessionId)) changedVisibleSessionIds.add(sessionId)
      }
      for (const sessionId of changedRenderSessionIds) {
        notifyListenersForSessionId(renderSessionListenersBySessionId, sessionId)
      }
      for (const sessionId of changedVisibleSessionIds) {
        notifyListenersForSessionId(visibleSessionListenersBySessionId, sessionId)
      }

      return true
    },
    subscribeToRenderSession(sessionId, listener) {
      return subscribeToSessionId(renderSessionListenersBySessionId, sessionId, listener)
    },
    subscribeToVisibleSession(sessionId, listener) {
      return subscribeToSessionId(visibleSessionListenersBySessionId, sessionId, listener)
    },
  }
}

function subscribeToSessionId(
  listenersBySessionId: Map<string, Set<() => void>>,
  sessionId: string,
  listener: () => void,
) {
  let listeners = listenersBySessionId.get(sessionId)
  if (!listeners) {
    listeners = new Set()
    listenersBySessionId.set(sessionId, listeners)
  }
  listeners.add(listener)

  return () => {
    const currentListeners = listenersBySessionId.get(sessionId)
    if (!currentListeners) return
    currentListeners.delete(listener)
    if (currentListeners.size === 0) listenersBySessionId.delete(sessionId)
  }
}

export function StudioPreviewRenderSessionStoreProvider(props: {
  children: React.ReactNode
  store: StudioPreviewRenderSessionStore
}) {
  return (
    <StudioPreviewRenderSessionStoreContext.Provider value={props.store}>
      {props.children}
    </StudioPreviewRenderSessionStoreContext.Provider>
  )
}

export function useStudioPreviewIsVisibleSession(sessionId: string, enabled = true): boolean {
  const store = React.useContext(StudioPreviewRenderSessionStoreContext)

  return React.useSyncExternalStore(
    React.useCallback(
      (listener) => (enabled ? store?.subscribeToVisibleSession(sessionId, listener) ?? (() => {}) : () => {}),
      [enabled, sessionId, store],
    ),
    React.useCallback(() => (enabled ? store?.isVisibleSessionId(sessionId) ?? false : false), [enabled, sessionId, store]),
    () => false,
  )
}

export function useStudioPreviewShouldRenderSession(sessionId: string): boolean {
  const store = React.useContext(StudioPreviewRenderSessionStoreContext)

  return React.useSyncExternalStore(
    React.useCallback((listener) => store?.subscribeToRenderSession(sessionId, listener) ?? (() => {}), [sessionId, store]),
    React.useCallback(() => store?.hasSessionId(sessionId) ?? false, [sessionId, store]),
    () => false,
  )
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}
