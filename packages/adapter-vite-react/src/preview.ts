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
  GTSXPreviewFrame,
  GTSXPreviewComponent,
  GTSXPreviewComponentLoader,
  GTSXPreviewModule,
  GTSXPreviewRouteParams,
  GTSXReactPreviewClientProps as GTSXVitePreviewClientProps,
} from "@gtsx/preview-react"

export type GTSXVitePreviewEntryModules = Record<string, () => Promise<GTSXPreviewModule>>

export function createGTSXVitePreviewComponentLoader(
  modules: GTSXVitePreviewEntryModules,
  options: { sourceRoot?: string } = {},
): (entry: string) => Promise<GTSXPreviewComponent | undefined> {
  const sourceRoot = normalizeSourceRoot(options.sourceRoot ?? "src")
  const modulesByEntryFile = normalizeVitePreviewEntryModules(modules, sourceRoot)

  return async (entry: string) => {
    const { file, exportName } = parseGTSXPreviewEntry(entry)
    const loader = modulesByEntryFile[file] ?? modules[toModuleKey(file, sourceRoot)]
    if (!loader) return undefined

    const moduleValue = await loader()
    const component = moduleValue[exportName]
    return isGTSXPreviewComponent(component) ? component : undefined
  }
}

function normalizeSourceRoot(sourceRoot: string): string {
  return sourceRoot.replace(/^\.\//, "").replace(/\/$/, "")
}

function normalizeVitePreviewEntryModules(
  modules: GTSXVitePreviewEntryModules,
  sourceRoot: string,
): GTSXVitePreviewEntryModules {
  const normalized: GTSXVitePreviewEntryModules = {}
  for (const [key, loader] of Object.entries(modules)) {
    for (const entryFile of entryFilesFromModuleKey(key, sourceRoot)) {
      normalized[entryFile] = loader
    }
  }
  return normalized
}

function toModuleKey(entryFile: string, sourceRoot: string): string {
  const prefix = sourceRoot === "." ? "" : `${sourceRoot}/`
  const localPath = prefix && entryFile.startsWith(prefix) ? entryFile.slice(prefix.length) : entryFile
  return localPath.startsWith("./") || localPath.startsWith("../") ? localPath : `./${localPath}`
}

function entryFilesFromModuleKey(moduleKey: string, sourceRoot: string): string[] {
  const normalizedModuleKey = moduleKey.replaceAll("\\", "/")
  const localPath = normalizedModuleKey.replace(/^\.\//, "").replace(/^\//, "")
  const candidates = new Set<string>()

  candidates.add(normalizePath(localPath))

  const rootRelativePath = localPath.replace(/^(\.\.\/)+/, "")
  candidates.add(normalizePath(rootRelativePath))

  if (localPath.startsWith("../")) {
    candidates.add(normalizePath(`${sourceRoot}/${localPath}`))
  } else if (sourceRoot === "." || localPath.startsWith(`${sourceRoot}/`)) {
    candidates.add(normalizePath(localPath))
  } else {
    candidates.add(normalizePath(`${sourceRoot}/${localPath}`))
  }

  return [...candidates]
}

function normalizePath(path: string): string {
  const segments: string[] = []
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join("/")
}
