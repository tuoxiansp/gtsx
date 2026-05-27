"use client"

import type { GBoundaryTreeNode } from "gtsx"

import type { StudioManifest } from "./manifest"
import type { StudioPreviewCacheEntry, StudioPreviewFrameState } from "./client"

type StudioPreviewCacheRecord = {
  cacheKey: string
  frameState: PersistedStudioPreviewFrameState
  id: string
  namespace: string
  updatedAt: number
}

type PersistedStudioPreviewFrameState = {
  expectedSessionId: string
  ready: boolean
  size?: {
    width: number
    height: number
  }
  tree?: GBoundaryTreeNode[]
}

const studioPreviewCacheDatabaseName = "gtsx-studio-preview-cache-v1"
const studioPreviewCacheStoreName = "previewFrames"
const studioPreviewCacheVersion = 1

export function studioPreviewIndexedDBNamespace(manifest: StudioManifest): string {
  const explicitNamespace = manifest.cache?.namespace?.trim()
  if (explicitNamespace) return `project:${explicitNamespace}`

  return `manifest:${hashString(
    JSON.stringify({
      files: manifest.files.map((file) => ({
        path: file.path,
        components: file.components.map((component) => ({
          coordinate: component.coordinate,
          exportName: component.exportName,
          cases: component.cases.map((testCase) => testCase.name),
        })),
      })),
      routes: manifest.routes,
      version: manifest.version,
    }),
  )}`
}

export async function readStudioPreviewIndexedDBCache(
  namespace: string,
  cacheKeys: string[],
): Promise<Record<string, StudioPreviewCacheEntry>> {
  if (!canUseIndexedDB() || cacheKeys.length === 0) return {}

  try {
    const database = await openStudioPreviewCacheDatabase()
    const transaction = database.transaction(studioPreviewCacheStoreName, "readonly")
    const store = transaction.objectStore(studioPreviewCacheStoreName)
    const records = await Promise.all(
      cacheKeys.map((cacheKey) => requestResult<StudioPreviewCacheRecord>(store.get(recordId(namespace, cacheKey)))),
    )
    await transactionDone(transaction)
    database.close()

    return Object.fromEntries(
      records.flatMap((record) =>
        record && record.namespace === namespace
          ? ([[record.cacheKey, { frameState: record.frameState, lastUsedAt: record.updatedAt }]] as [string, StudioPreviewCacheEntry][])
          : [],
      ),
    )
  } catch {
    return {}
  }
}

export async function writeStudioPreviewIndexedDBCache(
  namespace: string,
  entries: Record<string, StudioPreviewCacheEntry | undefined>,
): Promise<void> {
  const records = Object.entries(entries).flatMap(([cacheKey, entry]) => {
    const frameState = entry ? persistedStudioPreviewFrameState(entry.frameState) : undefined
    return frameState
      ? [
          {
            cacheKey,
            frameState,
            id: recordId(namespace, cacheKey),
            namespace,
            updatedAt: Date.now(),
          },
        ]
      : []
  })
  if (!canUseIndexedDB() || records.length === 0) return

  try {
    const database = await openStudioPreviewCacheDatabase()
    const transaction = database.transaction(studioPreviewCacheStoreName, "readwrite")
    const store = transaction.objectStore(studioPreviewCacheStoreName)
    for (const record of records) store.put(record)
    await transactionDone(transaction)
    database.close()
  } catch {
    // Browser storage may be unavailable in private or constrained contexts.
  }
}

function persistedStudioPreviewFrameState(state: StudioPreviewFrameState): PersistedStudioPreviewFrameState | undefined {
  if (!state.tree && !state.size) return undefined

  return {
    expectedSessionId: state.expectedSessionId,
    ready: state.ready,
    ...(state.size ? { size: state.size } : {}),
    ...(state.tree ? { tree: state.tree } : {}),
  }
}

function openStudioPreviewCacheDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(studioPreviewCacheDatabaseName, studioPreviewCacheVersion)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(studioPreviewCacheStoreName)) {
        const store = database.createObjectStore(studioPreviewCacheStoreName, { keyPath: "id" })
        store.createIndex("namespace", "namespace", { unique: false })
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
}

function canUseIndexedDB(): boolean {
  return typeof indexedDB !== "undefined"
}

function recordId(namespace: string, cacheKey: string): string {
  return `${namespace}\n${cacheKey}`
}

function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
