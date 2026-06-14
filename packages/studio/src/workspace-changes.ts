import type { StudioManifest, StudioManifestFile } from "./manifest"

export type StudioWorkspaceChangeKind = "added" | "modified" | "deleted"

export type StudioWorkspaceChangeSurface = "frames" | "drafts"

export type StudioWorkspaceChangePathSegment = {
  componentName: string
  coordinate: string
}

export type StudioWorkspaceChangeFrameKind = "added" | "deleted" | "changed" | "unchanged" | "unknown"

export type StudioWorkspaceChangeFrameImpact = {
  kind: StudioWorkspaceChangeFrameKind
  name: string
}

export type StudioWorkspaceChangeImpact = {
  frameNames: string[]
  frames?: StudioWorkspaceChangeFrameImpact[]
  path: StudioWorkspaceChangePathSegment[]
  rootComponentName: string
  rootCoordinate: string
  surface: StudioWorkspaceChangeSurface
}

export type StudioWorkspaceDeletedSummary = {
  componentNames?: string[]
  frameNames?: string[]
}

export type StudioWorkspaceChangeItem = {
  baselineFile?: StudioManifestFile
  baselineImpacts?: StudioWorkspaceChangeImpact[]
  currentFile?: StudioManifestFile
  deletedSummary?: StudioWorkspaceDeletedSummary
  filePath: string
  impacts: StudioWorkspaceChangeImpact[]
  kind: StudioWorkspaceChangeKind
  surface: StudioWorkspaceChangeSurface
}

/**
 * @internal Studio client/server protocol for the workspace changes tab.
 * User automation should use `runelight changes --json` instead.
 */
export type StudioWorkspaceChanges = {
  base: {
    kind: "git"
    /**
     * @internal Local generated baseline root used by Studio to resolve before-state preview targets.
     */
    baselineRoot: string
    manifest?: StudioManifest
    ref?: string
  } | {
    kind: "none"
  }
  items: StudioWorkspaceChangeItem[]
  version: 1
}

export function hasStudioWorkspaceChanges(changes: StudioWorkspaceChanges | undefined): boolean {
  return (changes?.items.length ?? 0) > 0
}
