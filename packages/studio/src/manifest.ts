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
  frames: GTSXProjectIndexComponent["frames"]
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

export type StudioDesignFrameEntry = {
  id: string
  entry: string
  filePath: string
  title: string
  exportName: string
  frameName: string
}

export type StudioDesignManifest = {
  frames: StudioDesignFrameEntry[]
}

export type StudioManifest = {
  version: 1
  cache?: StudioManifestCacheConfig
  design?: StudioDesignManifest
  routes: StudioManifestRouteConfig
  preview: StudioManifestPreviewConfig
  files: StudioManifestFile[]
  diagnostics: GTSXDiagnostic[]
}

export type CreateStudioManifestOptions = {
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
  cache?: Partial<StudioManifestCacheConfig>
  design?: StudioDesignManifest
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
  urlTemplate: "/gtsx?entry={entry}&frame={frame}{gframe}",
  allUrlTemplate: "/gtsx?entry={entry}{gframe}",
}

export function createStudioManifest(projectIndex: GTSXProjectIndex, options: CreateStudioManifestOptions = {}): StudioManifest {
  return {
    version: 1,
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.design && options.design.frames.length > 0 ? { design: options.design } : {}),
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

export function createStudioManifestFromGTSXConfig(
  projectIndex: GTSXProjectIndex,
  config: GTSXConfig,
  options: Pick<CreateStudioManifestOptions, "design" | "diagnostics"> = {},
): StudioManifest {
  const resolved = resolveGTSXConfig(config)

  return createStudioManifest(projectIndex, {
    ...(resolved.project.namespace ? { cache: { namespace: resolved.project.namespace } } : {}),
    design: options.design,
    diagnostics: options.diagnostics,
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
    urlTemplate: `${routes.preview}?entry={entry}&frame={frame}{gframe}`,
    allUrlTemplate: `${routes.preview}?entry={entry}{gframe}`,
  }
}
