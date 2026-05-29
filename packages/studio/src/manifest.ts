import { resolveGTSXConfig } from "@gtsx/core/config-model"
import type { GTSXConfig, GTSXDiagnostic } from "@gtsx/core"
import type { GTSXProjectIndex, GTSXProjectIndexComponent } from "@gtsx/core/project-index"

export type StudioManifestRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type StudioManifestPreviewConfig = {
  urlTemplate: string
  allUrlTemplate?: string
}

export type StudioManifestComponent = {
  coordinate: string
  filePath: string
  sourceHash?: string
  exportName: string
  componentName: string
  mode: GTSXProjectIndexComponent["mode"]
  cases: GTSXProjectIndexComponent["cases"]
  providers: GTSXProjectIndexComponent["providers"]
  dependencies?: GTSXProjectIndexComponent["dependencies"]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifestFile = {
  path: string
  sourceHash?: string
  groupId: string
  components: StudioManifestComponent[]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifest = {
  version: 1
  cache?: StudioManifestCacheConfig
  routes: StudioManifestRouteConfig
  preview: StudioManifestPreviewConfig
  files: StudioManifestFile[]
  diagnostics: GTSXDiagnostic[]
}

export type CreateStudioManifestOptions = {
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
  cache?: Partial<StudioManifestCacheConfig>
  diagnostics?: GTSXDiagnostic[]
}

export type StudioManifestCacheConfig = {
  namespace?: string
}

type ProjectIndexFileWithSourceHash = GTSXProjectIndex["files"][number] & {
  sourceHash?: string
  components: Array<GTSXProjectIndexComponent & { sourceHash?: string }>
}

const DEFAULT_ROUTES: StudioManifestRouteConfig = {
  preview: "/gtsx",
  studio: "/gtsx/studio",
  manifest: "/gtsx/studio/manifest",
}

const DEFAULT_PREVIEW: StudioManifestPreviewConfig = {
  urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
  allUrlTemplate: "/gtsx?entry={entry}{gcase}",
}

export function createStudioManifest(projectIndex: GTSXProjectIndex, options: CreateStudioManifestOptions = {}): StudioManifest {
  return {
    version: 1,
    ...(options.cache ? { cache: options.cache } : {}),
    routes: { ...DEFAULT_ROUTES, ...options.routes },
    preview: { ...DEFAULT_PREVIEW, ...options.preview },
    files: projectIndex.files.map((projectFile) => {
      const file = projectFile as ProjectIndexFileWithSourceHash
      return {
        path: file.path,
        sourceHash: file.sourceHash,
        groupId: `file:${file.path}`,
        components: file.components,
        diagnostics: file.diagnostics,
      }
    }),
    diagnostics: [...projectIndex.diagnostics, ...(options.diagnostics ?? [])],
  }
}

export function createStudioManifestFromGTSXConfig(projectIndex: GTSXProjectIndex, config: GTSXConfig): StudioManifest {
  const resolved = resolveGTSXConfig(config)

  return createStudioManifest(projectIndex, {
    ...(resolved.project.namespace ? { cache: { namespace: resolved.project.namespace } } : {}),
    preview: previewConfigFromRoutes(resolved.routes),
    routes: resolved.routes,
  })
}

export type StudioRouteSearchParams = Record<string, string | string[] | undefined> | URLSearchParams | undefined

export function studioUrlSearchFromSearchParams(searchParams: StudioRouteSearchParams): string {
  if (searchParams instanceof URLSearchParams) return searchParams.toString()

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }
  return params.toString()
}

function previewConfigFromRoutes(routes: StudioManifestRouteConfig): StudioManifestPreviewConfig {
  return {
    urlTemplate: `${routes.preview}?entry={entry}&case={case}{gcase}`,
    allUrlTemplate: `${routes.preview}?entry={entry}{gcase}`,
  }
}
