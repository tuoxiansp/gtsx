import type { ComponentType } from "react"

export type GTSXPreviewCase<Props = Record<string, unknown>> = {
  props: Props
  scope?: unknown
}

export type GTSXPreviewComponent<Props = Record<string, unknown>> = ComponentType<Props> & {
  cases?: Record<string, GTSXPreviewCase<Props>>
}

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
