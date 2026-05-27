export {
  GTSXReactPreviewClient as GTSXVitePreviewClient,
  isGTSXPreviewComponent,
  parseGTSXPreviewEntry,
  readGTSXPreviewRouteParams,
} from "@gtsx/preview-react"

import {
  isGTSXPreviewComponent,
  parseGTSXPreviewEntry,
  type GTSXPreviewComponent,
  type GTSXPreviewModule,
} from "@gtsx/preview-react"

export type {
  GTSXPreviewCase,
  GTSXPreviewComponent,
  GTSXPreviewComponentLoader,
  GTSXPreviewModule,
  GTSXPreviewRouteParams,
  GTSXReactPreviewClientProps as GTSXVitePreviewClientProps,
} from "@gtsx/preview-react"

export type GTSXVitePreviewEntryModules = Record<string, () => Promise<GTSXPreviewModule>>

export function createGTSXVitePreviewComponentLoader(
  modules: GTSXVitePreviewEntryModules,
  options: { projectRoot?: string } = {},
): (entry: string) => Promise<GTSXPreviewComponent | undefined> {
  const projectRoot = normalizeProjectRoot(options.projectRoot ?? "src")

  return async (entry: string) => {
    const { file, exportName } = parseGTSXPreviewEntry(entry)
    const loader = modules[toModuleKey(file, projectRoot)]
    if (!loader) return undefined

    const moduleValue = await loader()
    const component = moduleValue[exportName]
    return isGTSXPreviewComponent(component) ? component : undefined
  }
}

function normalizeProjectRoot(projectRoot: string): string {
  return projectRoot.replace(/^\.\//, "").replace(/\/$/, "")
}

function toModuleKey(entryFile: string, projectRoot: string): string {
  const prefix = projectRoot === "." ? "" : `${projectRoot}/`
  const localPath = prefix && entryFile.startsWith(prefix) ? entryFile.slice(prefix.length) : entryFile
  return localPath.startsWith(".") ? localPath : `./${localPath}`
}
