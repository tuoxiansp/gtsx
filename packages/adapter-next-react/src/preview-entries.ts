import type { RunelightPreviewComponent } from "@runelight/preview-react"

export type RunelightPreviewModule = Record<string, unknown>
export type RunelightPreviewEntryLoader = () => Promise<RunelightPreviewModule>
export type RunelightPreviewEntryLoaders = Record<string, RunelightPreviewEntryLoader>

export const runelightPreviewEntryLoaders = {} satisfies RunelightPreviewEntryLoaders

export async function loadRunelightPreviewComponent(_entry: string): Promise<RunelightPreviewComponent | undefined> {
  return undefined
}

export function parseRunelightPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}
