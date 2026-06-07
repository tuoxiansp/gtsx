import { extname, relative, resolve, sep } from "node:path"
import { mkdirSync, readFileSync, statSync } from "node:fs"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { transformRunelightReactModule } from "@runelight/core/react-transform"
import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import { runelightDesignRootFromEntryRoot, normalizeRunelightPath, requireRunelightEntryRoot } from "@runelight/core/config-model"
import type { RunelightConfig, ResolvedRunelightConfig } from "@runelight/core"

export { transformRunelightComponentBoundaries, transformRunelightReactModule } from "@runelight/core/react-transform"

type ViteLikeConfig = {
  root: string
}

type ViteLikeModuleGraph = {
  getModuleById(id: string): unknown
  idToModuleMap?: Map<string, unknown>
  invalidateAll?(): void
  invalidateModule(module: unknown): void
  urlToModuleMap?: Map<string, unknown>
}

type ViteLikeHotChannel = {
  send(payload: { type: "full-reload" }): void
}

type ViteLikeRequest = {
  method?: string
  url?: string
}

type ViteLikeResponse = {
  statusCode?: number
  setHeader(name: string, value: string): void
  end(body?: string | Buffer): void
}

type ViteLikeMiddleware = (request: ViteLikeRequest, response: ViteLikeResponse, next: () => void) => void

type ViteLikeDevServer = {
  middlewares?: {
    use(handler: ViteLikeMiddleware): void
  }
  moduleGraph?: ViteLikeModuleGraph
  ws?: ViteLikeHotChannel
  watcher?: {
    add(paths: string | string[]): void
  }
}

type ViteLikeHotUpdateOptions = {
  file: string
  modules?: unknown[]
  server: ViteLikeDevServer
}

type ViteLikeHotUpdateHookContext = {
  environment?: {
    hot?: ViteLikeHotChannel
    moduleGraph?: ViteLikeModuleGraph
  }
}

type TransformResult = {
  code: string
  map: null
}

type RunelightViteReactOptions = {
  config?: RunelightConfig
  entryRoot?: string
  sourceRoot?: string
  root?: string
  studioAppDirectory?: string
  tsconfigPath?: string
}

export function runelightViteReact(options: RunelightViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  let resolvedConfig = options.config ? resolveRunelightConfig(options.config) : undefined
  const virtualProjectIndexId = "virtual:runelight/project-index"
  const virtualConfigId = "virtual:runelight/config"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`
  const resolvedVirtualConfigId = `\0${virtualConfigId}`

  return {
    name: "@runelight/adapter-vite-react",
    enforce: "pre" as const,
    config() {
      return {
        optimizeDeps: {
          include: [
            "@runelight/core > react-tracked",
            "@runelight/core > react-tracked > use-context-selector",
            "@runelight/core > react-tracked > use-context-selector > scheduler",
          ],
          exclude: [
            "@runelight/core",
            "@runelight/preview-react",
            "@runelight/studio",
            "@runelight/adapter-vite-react",
            "typescript",
            virtualConfigId,
            virtualProjectIndexId,
          ],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    configureServer(server: ViteLikeDevServer) {
      ensureRunelightDesignDirectory(root, entryRoot())
      server.watcher?.add(runelightViteWatchRoots(root, sourceRoot(), entryRoot()))
      server.middlewares?.use((request, response, next) => {
        void handleRunelightViteStudioRequest(request, response, {
          config: requireResolvedConfig(),
          root,
          sourceRoot: sourceRoot(),
          studioAppDirectory: options.studioAppDirectory,
          tsconfigPath: options.tsconfigPath ?? resolvedConfig?.project.tsconfig,
        })
          .then((handled) => {
            if (!handled) next()
          })
          .catch((error: unknown) => {
            response.statusCode = 500
            response.setHeader("content-type", "text/plain; charset=utf-8")
            response.end(error instanceof Error ? error.message : "Runelight Studio request failed.")
          })
      })
    },
    resolveId(id: string) {
      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      if (id === virtualConfigId) return resolvedVirtualConfigId
      return null
    },
    load(id: string): TransformResult | null {
      if (id === resolvedVirtualConfigId) {
        return {
          code: `export default ${JSON.stringify(requireResolvedConfig())}\n`,
          map: null,
        }
      }
      if (id !== resolvedVirtualProjectIndexId) return null
      const projectIndex = buildRunelightProjectIndex({
        additionalRoots: [runelightDesignRootFromEntryRoot(entryRoot())],
        cwd: root,
        sourceRoot: sourceRoot(),
        tsconfigPath: options.tsconfigPath ?? resolvedConfig?.project.tsconfig,
      })
      return {
        code: `export default ${JSON.stringify(projectIndex)}\n`,
        map: null,
      }
    },
    transform(code: string, id: string): TransformResult | null {
      const transformed = transformRunelightReactModule({
        code,
        filePath: id,
        root,
      })

      return transformed ? { code: transformed.code, map: null } : null
    },
    hotUpdate(this: ViteLikeHotUpdateHookContext, context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      return handleRunelightHotUpdate(context, {
        hot: this.environment?.hot ?? context.server.ws,
        moduleGraph: this.environment?.moduleGraph ?? context.server.moduleGraph,
      })
    },
    handleHotUpdate(context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      return handleRunelightHotUpdate(context, {
        hot: context.server.ws,
        moduleGraph: context.server.moduleGraph,
      })
    },
  }

  function sourceRoot(): string {
    return options.sourceRoot ?? resolvedConfig?.project.sourceRoot ?? "src"
  }

  function entryRoot(): string {
    return normalizeRunelightPath(options.entryRoot ?? requireRunelightEntryRoot(requireResolvedConfig()))
  }

  function requireResolvedConfig(): ResolvedRunelightConfig {
    if (resolvedConfig) return resolvedConfig

    const loaded = loadRunelightConfig(root)
    if (loaded.config) {
      resolvedConfig = resolveRunelightConfig(loaded.config)
      return resolvedConfig
    }

    const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
    throw new Error(message || "Missing runelight.config.ts for Vite adapter.")
  }

  function handleRunelightHotUpdate(
    context: ViteLikeHotUpdateOptions,
    environment: { hot?: ViteLikeHotChannel; moduleGraph?: ViteLikeModuleGraph },
  ): unknown[] | undefined {
    if (!isRunelightFileInViteWatchRoots(root, sourceRoot(), entryRoot(), context.file)) return undefined

    const module = findViteVirtualModule(environment.moduleGraph, virtualProjectIndexId, resolvedVirtualProjectIndexId)
    const updatedModules = [...(context.modules ?? [])]

    if (module) {
      environment.moduleGraph?.invalidateModule(module)
      updatedModules.push(module)
    } else {
      environment.moduleGraph?.invalidateAll?.()
    }
    environment.hot?.send({ type: "full-reload" })
    return updatedModules
  }
}

type RunelightViteStudioRequestOptions = {
  config: ResolvedRunelightConfig
  root: string
  sourceRoot: string
  studioAppDirectory?: string
  tsconfigPath?: string
}

type StudioManifestModule = {
  createStudioManifestFromRunelightConfig(projectIndex: ReturnType<typeof buildRunelightProjectIndex>, config: ResolvedRunelightConfig): unknown
}

type StudioStaticAppModule = {
  resolveRunelightStudioAppAssetPath(assetPath?: string): string
}

const studioManifestModuleId = "@runelight/studio/manifest"
const studioStaticAppModuleId = "@runelight/studio/static-app"

async function handleRunelightViteStudioRequest(
  request: ViteLikeRequest,
  response: ViteLikeResponse,
  options: RunelightViteStudioRequestOptions,
): Promise<boolean> {
  if (request.method && request.method !== "GET" && request.method !== "HEAD") return false

  const pathname = requestPathname(request.url)
  if (pathname === options.config.routes.manifest) {
    await serveRunelightViteStudioManifest(response, options)
    return true
  }

  const assetPath = runelightStudioAssetPathFromRequest(pathname, options.config.routes.studio)
  if (!assetPath) return false

  await serveRunelightViteStudioAsset(response, assetPath, options)
  return true
}

async function serveRunelightViteStudioManifest(response: ViteLikeResponse, options: RunelightViteStudioRequestOptions) {
  const projectIndex = buildRunelightProjectIndex({
    additionalRoots: [runelightDesignRootFromEntryRoot(requireRunelightEntryRoot(options.config))],
    cwd: options.root,
    sourceRoot: options.sourceRoot,
    tsconfigPath: options.tsconfigPath,
  })
  const { createStudioManifestFromRunelightConfig } = await import(studioManifestModuleId) as StudioManifestModule
  const manifest = createStudioManifestFromRunelightConfig(projectIndex, options.config)

  response.statusCode = 200
  response.setHeader("content-type", "application/json; charset=utf-8")
  response.end(JSON.stringify(manifest))
}

async function serveRunelightViteStudioAsset(
  response: ViteLikeResponse,
  assetPath: string,
  options: Pick<RunelightViteStudioRequestOptions, "studioAppDirectory">,
) {
  const filePath = await resolveRunelightStudioAssetFilePath(assetPath, options)
  const fileStat = statIfFile(filePath)

  if (!fileStat) {
    response.statusCode = 404
    response.setHeader("content-type", "text/plain; charset=utf-8")
    response.end("Runelight Studio asset not found.")
    return
  }

  response.statusCode = 200
  response.setHeader("content-type", studioAssetContentType(filePath))
  response.setHeader("content-length", String(fileStat.size))
  response.end(readFileSync(filePath))
}

async function resolveRunelightStudioAssetFilePath(
  assetPath: string,
  options: Pick<RunelightViteStudioRequestOptions, "studioAppDirectory">,
): Promise<string> {
  const normalizedAssetPath = normalizeRunelightStudioAssetPath(assetPath)
  if (options.studioAppDirectory) return resolve(options.studioAppDirectory, normalizedAssetPath)

  const { resolveRunelightStudioAppAssetPath } = await import(studioStaticAppModuleId) as StudioStaticAppModule
  return resolveRunelightStudioAppAssetPath(normalizedAssetPath)
}

function requestPathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://runelight.local").pathname
}

function runelightStudioAssetPathFromRequest(pathname: string, studioRoute: string): string | undefined {
  const normalizedStudioRoute = studioRoute.replace(/\/+$/, "")
  if (pathname === normalizedStudioRoute || pathname === `${normalizedStudioRoute}/`) return "index.html"

  const assetsPrefix = `${normalizedStudioRoute}/assets/`
  if (pathname.startsWith(assetsPrefix)) return `assets/${pathname.slice(assetsPrefix.length)}`

  return undefined
}

function normalizeRunelightStudioAssetPath(assetPath: string): string {
  const normalized = assetPath.replace(/^\/+/, "")
  if (normalized === "" || normalized.split("/").includes("..")) {
    throw new Error(`Invalid Runelight Studio asset path: ${assetPath}`)
  }
  return normalized
}

function studioAssetContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8"
    case ".html":
      return "text/html; charset=utf-8"
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

function statIfFile(filePath: string) {
  try {
    const fileStat = statSync(filePath)
    return fileStat.isFile() ? fileStat : undefined
  } catch {
    return undefined
  }
}

function runelightViteWatchRoots(root: string, sourceRoot: string, entryRoot: string): string[] {
  const designRoot = runelightDesignRootFromEntryRoot(entryRoot)
  return [...new Set([sourceRoot, entryRoot, designRoot])].map((watchRoot) =>
    resolve(root, watchRoot),
  )
}

function isRunelightFileInViteWatchRoots(root: string, sourceRoot: string, entryRoot: string, file: string): boolean {
  if (!file.endsWith(".g.tsx")) return false

  const watchRoots = runelightViteWatchRoots(root, sourceRoot, entryRoot)
  return watchRoots.some((watchRoot) => isPathInside(watchRoot, file))
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath).split(sep).join("/")
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== "..")
}

function ensureRunelightDesignDirectory(root: string, entryRoot: string) {
  mkdirSync(resolve(root, runelightDesignRootFromEntryRoot(entryRoot)), { recursive: true })
}

function findViteVirtualModule(
  moduleGraph: ViteLikeModuleGraph | undefined,
  virtualId: string,
  resolvedVirtualId: string,
): unknown | undefined {
  if (!moduleGraph) return undefined

  return (
    moduleGraph.getModuleById(resolvedVirtualId) ??
    moduleGraph.getModuleById(virtualId) ??
    findViteVirtualModuleInMap(moduleGraph.idToModuleMap, virtualId, resolvedVirtualId) ??
    findViteVirtualModuleInMap(moduleGraph.urlToModuleMap, virtualId, resolvedVirtualId)
  )
}

function findViteVirtualModuleInMap(
  modules: Map<string, unknown> | undefined,
  virtualId: string,
  resolvedVirtualId: string,
): unknown | undefined {
  if (!modules) return undefined

  return (
    modules.get(resolvedVirtualId) ??
    modules.get(virtualId) ??
    [...modules].find(([id]) => id.includes(virtualId) || id.includes(resolvedVirtualId))?.[1]
  )
}
