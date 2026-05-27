import type { GTSXPreviewComponent } from "@gtsx/preview-react"

export type GTSXPreviewModule = Record<string, unknown>
export type GTSXPreviewEntryLoader = () => Promise<GTSXPreviewModule>
export type GTSXPreviewEntryLoaders = Record<string, GTSXPreviewEntryLoader>

export const gtsxPreviewEntryLoaders = {} satisfies GTSXPreviewEntryLoaders

export async function loadGTSXPreviewComponent(_entry: string): Promise<GTSXPreviewComponent | undefined> {
  return undefined
}

export function parseGTSXPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}
