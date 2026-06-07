import { runelightDesignRootFromEntryRoot, requireRunelightEntryRoot, resolveRunelightConfig } from "@runelight/core/config-model"
import type { RunelightConfig, RunelightDiagnostic } from "@runelight/core"
import type { RunelightProjectIndex, RunelightProjectIndexComponent } from "@runelight/core/project-index"

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
  mode: RunelightProjectIndexComponent["mode"]
  frames: RunelightProjectIndexComponent["frames"]
  providers: RunelightProjectIndexComponent["providers"]
  dependencies?: RunelightProjectIndexComponent["dependencies"]
  diagnostics: RunelightDiagnostic[]
}

export type StudioManifestFile = {
  path: string
  sourceHash?: string
  groupId: string
  components: StudioManifestComponent[]
  diagnostics: RunelightDiagnostic[]
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
  diagnostics: RunelightDiagnostic[]
}

export type CreateStudioManifestOptions = {
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
  cache?: Partial<StudioManifestCacheConfig>
  design?: StudioDesignManifest
  diagnostics?: RunelightDiagnostic[]
}

export type StudioManifestCacheConfig = {
  namespace?: string
}

type ProjectIndexFileWithSourceHash = RunelightProjectIndex["files"][number] & {
  sourceHash?: string
  components: Array<RunelightProjectIndexComponent & { sourceHash?: string }>
}

const DEFAULT_ROUTES: StudioManifestRouteConfig = {
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}

const DEFAULT_PREVIEW: StudioManifestPreviewConfig = {
  urlTemplate: "/runelight?entry={entry}&frame={frame}{frameOverrides}",
  allUrlTemplate: "/runelight?entry={entry}{frameOverrides}",
}

export function createStudioManifest(projectIndex: RunelightProjectIndex, options: CreateStudioManifestOptions = {}): StudioManifest {
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

export function createStudioManifestFromRunelightConfig(
  projectIndex: RunelightProjectIndex,
  config: RunelightConfig,
  options: Pick<CreateStudioManifestOptions, "design" | "diagnostics"> = {},
): StudioManifest {
  const resolved = resolveRunelightConfig(config)
  const entryRoot = requireRunelightEntryRoot(resolved)

  return createStudioManifest(projectIndex, {
    ...(resolved.project.namespace ? { cache: { namespace: resolved.project.namespace } } : {}),
    design: options.design ?? discoverStudioDesignManifest(projectIndex, entryRoot),
    diagnostics: options.diagnostics,
    preview: previewConfigFromRoutes(resolved.routes),
    routes: resolved.routes,
  })
}

export function discoverStudioDesignManifest(projectIndex: RunelightProjectIndex, entryRoot: string): StudioDesignManifest {
  const designPathPrefix = studioDesignPathPrefix(entryRoot)
  const frames = projectIndex.files.flatMap((file) => {
    if (!file.path.startsWith(designPathPrefix)) return []

    return file.components.flatMap((component) => {
      const componentFrames = component.frames.length > 0 ? component.frames : [{ name: "missing-frames" }]
      return componentFrames.map((frame) => {
        return {
          id: `${component.coordinate}:${frame.name}`,
          entry: component.coordinate,
          filePath: component.filePath,
          title: component.componentName,
          exportName: component.exportName,
          frameName: frame.name,
        }
      })
    })
  })

  return { frames }
}

export function studioDesignRoots(entryRoot: string): string[] {
  return [runelightDesignRootFromEntryRoot(entryRoot)]
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
    urlTemplate: `${routes.preview}?entry={entry}&frame={frame}{frameOverrides}`,
    allUrlTemplate: `${routes.preview}?entry={entry}{frameOverrides}`,
  }
}

function studioDesignPathPrefix(entryRoot: string): string {
  return `${runelightDesignRootFromEntryRoot(entryRoot)}/`
}
