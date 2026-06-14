import {
  runelightDesignRootFromEntryRoot,
  type ResolvedRunelightConfig,
  type RunelightDiagnostic,
} from "@runelight/core"
import type { RunelightProjectIndex } from "@runelight/core/project-index"

export type StudioManifestRouteConfig = {
  /**
   * @internal Studio changes data route. Fixed adapter/Studio sidecar protocol, not user-configurable.
   */
  changes?: string
  /**
   * @internal Studio refresh event stream route. Fixed adapter/Studio sidecar protocol, not user-configurable.
   */
  events?: string
  preview: string
  studio: string
  manifest: string
}

export type StudioManifestProviderVariantSelection = string | string[]

export type StudioManifestFrame = {
  kind: "pure" | "scope"
  name: string
  providerVariants?: Record<string, StudioManifestProviderVariantSelection>
  providers?: string[]
}

export type StudioManifestProvider = {
  name: string
  frames: string[]
  variants?: string[]
}

export type StudioManifestComponent = {
  coordinate: string
  filePath: string
  sourceHash: string
  exportName: string
  componentName: string
  mode: "pure" | "scope" | "unknown"
  frames: StudioManifestFrame[]
  providers: Record<string, StudioManifestProvider>
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  dependencies?: string[]
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  frameDependencies?: Record<string, string[]>
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  frameVisualSignatures?: Record<string, string>
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  visualSignature?: string
  diagnostics: RunelightDiagnostic[]
}

export type StudioManifestFile = {
  path: string
  sourceHash: string
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
  serveSession?: StudioManifestServeSession
  routes: StudioManifestRouteConfig
  files: StudioManifestFile[]
  diagnostics: RunelightDiagnostic[]
}

/**
 * @internal Low-level Studio manifest builder options used by first-party adapters.
 */
export type CreateStudioManifestOptions = {
  cache?: StudioManifestCacheConfig
  design?: StudioDesignManifest
  additionalDiagnostics?: RunelightDiagnostic[]
}

export type StudioManifestCacheConfig = {
  namespace: string
}

export type StudioManifestServeSession = {
  projectKey?: string
  sessionId?: string
}

type ProjectIndexFileWithSourceHash = RunelightProjectIndex["files"][number] & {
  components: Array<RunelightProjectIndex["files"][number]["components"][number]>
}

const DEFAULT_ROUTES: StudioManifestRouteConfig = {
  changes: "/runelight/studio/changes",
  events: "/runelight/studio/events",
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}

/**
 * @internal Low-level Studio manifest builder used by first-party adapters. Custom hosts should use `createStudioManifestProvider`.
 */
export function createStudioManifest(projectIndex: RunelightProjectIndex, options: CreateStudioManifestOptions = {}): StudioManifest {
  const serveSession = serveSessionFromEnvironment()
  const cache = normalizeStudioManifestCache(options.cache)

  return {
    version: 1,
    ...(cache ? { cache } : {}),
    ...(options.design && options.design.frames.length > 0 ? { design: options.design } : {}),
    ...(serveSession ? { serveSession } : {}),
    routes: DEFAULT_ROUTES,
    files: projectIndex.files.map((projectFile) => {
      const file = projectFile as ProjectIndexFileWithSourceHash
      return {
        path: file.path,
        sourceHash: file.sourceHash,
        components: file.components,
        diagnostics: file.diagnostics,
      }
    }),
    diagnostics: [...projectIndex.diagnostics, ...(options.additionalDiagnostics ?? [])],
  }
}

function serveSessionFromEnvironment(): StudioManifestServeSession | undefined {
  const projectKey = process.env.RUNELIGHT_PROJECT_KEY
  const sessionId = process.env.RUNELIGHT_SESSION_ID
  if (!projectKey && !sessionId) return undefined

  return {
    ...(projectKey ? { projectKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

function normalizeStudioManifestCache(cache: StudioManifestCacheConfig | undefined): StudioManifestCacheConfig | undefined {
  const namespace = cache?.namespace.trim()
  return namespace ? { namespace } : undefined
}

/**
 * @internal Low-level Studio manifest builder used by first-party adapters. Custom hosts should use `createStudioManifestProvider`.
 */
export function createStudioManifestFromResolvedConfig(
  projectIndex: RunelightProjectIndex,
  config: ResolvedRunelightConfig,
  options: Pick<CreateStudioManifestOptions, "design" | "additionalDiagnostics"> = {},
): StudioManifest {
  const entryRoot = config.project.entryRoot

  return createStudioManifest(projectIndex, {
    ...(config.project.namespace ? { cache: { namespace: config.project.namespace } } : {}),
    design: options.design ?? discoverStudioDesignManifest(projectIndex, entryRoot),
    additionalDiagnostics: options.additionalDiagnostics,
  })
}

/**
 * @internal Low-level design manifest discovery used by first-party adapters.
 */
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

function studioDesignPathPrefix(entryRoot: string): string {
  return `${runelightDesignRootFromEntryRoot(entryRoot)}/`
}
