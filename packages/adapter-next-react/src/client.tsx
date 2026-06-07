"use client"

import { installRunelightNextDevIndicatorCleanup } from "./dev-indicator-cleanup.js"

export type RunelightNextDevIndicatorCleanupProps = {
  pathPrefix?: string
}

const installedPathPrefixes = new Set<string>()

ensureRunelightNextDevIndicatorCleanup()

export function RunelightNextDevIndicatorCleanup(props: RunelightNextDevIndicatorCleanupProps) {
  ensureRunelightNextDevIndicatorCleanup(props.pathPrefix)
  return null
}

export function ensureRunelightNextDevIndicatorCleanup(pathPrefix = "/runelight"): void {
  if (installedPathPrefixes.has(pathPrefix)) return

  installedPathPrefixes.add(pathPrefix)
  installRunelightNextDevIndicatorCleanup({ pathPrefix })
}

export { installRunelightNextDevIndicatorCleanup }
