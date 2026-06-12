export {
  RunelightReactPreviewClient as RunelightVitePreviewClient,
  isRunelightReactPreviewComponent,
  parseRunelightReactPreviewEntry,
  readRunelightReactPreviewRouteParams,
} from "@runelight/react/preview"

import {
  isRunelightReactPreviewComponent,
  parseRunelightReactPreviewEntry,
  type RunelightReactPreviewComponent,
  type RunelightReactPreviewModule,
} from "@runelight/react/preview"

export type {
  RunelightReactPreviewFrame,
  RunelightReactPreviewComponent,
  RunelightReactPreviewComponentLoader,
  RunelightReactPreviewModule,
  RunelightReactPreviewRouteParams,
  RunelightReactPreviewClientProps as RunelightVitePreviewClientProps,
} from "@runelight/react/preview"

export type RunelightVitePreviewEntryModules = Record<string, () => Promise<RunelightReactPreviewModule>>

export type RunelightVitePreviewComponentLoaderOptions = {
  sourceRoot?: string
}

export function createRunelightVitePreviewComponentLoader(
  modules: RunelightVitePreviewEntryModules,
  options: RunelightVitePreviewComponentLoaderOptions = {},
): (entry: string) => Promise<RunelightReactPreviewComponent | undefined> {
  const sourceRoot = normalizeSourceRoot(options.sourceRoot ?? "src")
  const modulesByEntryFile = normalizeVitePreviewEntryModules(modules, sourceRoot)

  return async (entry: string) => {
    const { file, exportName } = parseRunelightReactPreviewEntry(entry)
    const loader = modulesByEntryFile[file] ?? modules[toModuleKey(file, sourceRoot)]
    if (!loader) return undefined

    const moduleValue = await loader()
    const component = moduleValue[exportName]
    return isRunelightReactPreviewComponent(component) ? component : undefined
  }
}

function normalizeSourceRoot(sourceRoot: string): string {
  return sourceRoot.replace(/^\.\//, "").replace(/\/$/, "")
}

function normalizeVitePreviewEntryModules(
  modules: RunelightVitePreviewEntryModules,
  sourceRoot: string,
): RunelightVitePreviewEntryModules {
  const normalized: RunelightVitePreviewEntryModules = {}
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
  const normalizedModuleKey = moduleKey.replaceAll("\\", "/").split("?", 1)[0] ?? moduleKey
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
