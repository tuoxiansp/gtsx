"use client"

import { installGTSXNextDevIndicatorCleanup } from "./dev-indicator-cleanup.js"

export type GTSXNextDevIndicatorCleanupProps = {
  pathPrefix?: string
}

const installedPathPrefixes = new Set<string>()

ensureGTSXNextDevIndicatorCleanup()

export function GTSXNextDevIndicatorCleanup(props: GTSXNextDevIndicatorCleanupProps) {
  ensureGTSXNextDevIndicatorCleanup(props.pathPrefix)
  return null
}

export function ensureGTSXNextDevIndicatorCleanup(pathPrefix = "/gtsx"): void {
  if (installedPathPrefixes.has(pathPrefix)) return

  installedPathPrefixes.add(pathPrefix)
  installGTSXNextDevIndicatorCleanup({ pathPrefix })
}

export { installGTSXNextDevIndicatorCleanup }
