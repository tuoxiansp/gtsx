import { extname, relative, resolve, sep } from "node:path"
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { transformRunelightReactModule } from "@runelight/core/react-transform"
import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import { runelightDesignRootFromEntryRoot, normalizeRunelightPath, requireRunelightEntryRoot } from "@runelight/core/config-model"
import type { RunelightConfig, ResolvedRunelightConfig } from "@runelight/core"

export { transformRunelightComponentBoundaries, transformRunelightReactModule } from "@runelight/core/react-transform"

type ViteLikeConfig = {
  command?: "build" | "serve"
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

type ViteLikePluginContext = {
  emitFile(file: { id?: string; fileName?: string; name?: string; source?: string | Buffer; type: "asset" | "chunk" }): string
  getFileName(referenceId: string): string
}

type ViteLikeOutputBundle = Record<string, {
  fileName?: string
  type: "asset" | "chunk"
  viteMetadata?: {
    importedCss?: Set<string>
  }
}>

type TransformResult = {
  code: string
  map: null
}

type RunelightViteReactOptions = {
  config?: RunelightConfig
  entryRoot?: string
  exposeInProduction?: boolean
  previewEntry?: string
  sourceRoot?: string
  root?: string
  studioAppDirectory?: string
  tsconfigPath?: string
}

const runelightDevEnvName = "RUNELIGHT_DEV"
const runelightReactPreviewQuery = "runelight-preview"
const virtualProductionPreviewEntryId = "virtual:runelight/production-preview-entry"
const resolvedVirtualProductionPreviewEntryId = `\0${virtualProductionPreviewEntryId}`

export function runelightViteReact(options: RunelightViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  let resolvedConfig = options.config ? resolveRunelightConfig(options.config) : undefined
  let command: ViteLikeConfig["command"]
  let productionPreviewEntryReference: string | undefined
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
      command = config.command
    },
    transformIndexHtml() {
      if (!isRunelightProductionExposeMode()) return undefined

      return [{
        children: productionExposeRedirectScript(requireResolvedConfig()),
        tag: "script",
      }]
    },
    buildStart(this: ViteLikePluginContext) {
      if (!isRunelightProductionExposeMode()) return

      productionPreviewEntryReference = this.emitFile({
        id: virtualProductionPreviewEntryId,
        name: "runelight-preview",
        type: "chunk",
      })
    },
    configureServer(server: ViteLikeDevServer) {
      if (!isRunelightDevMode()) return

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
      if (!isRunelightPreviewMode()) return null

      if (id === virtualProductionPreviewEntryId) return resolvedVirtualProductionPreviewEntryId
      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      if (id === virtualConfigId) return resolvedVirtualConfigId
      return null
    },
    load(id: string): TransformResult | null {
      if (!isRunelightPreviewMode()) return null

      if (id === resolvedVirtualProductionPreviewEntryId) {
        return {
          code: productionPreviewEntryCode(productionPreviewEntryPath()),
          map: null,
        }
      }
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
        ...(hasRunelightPreviewQuery(id, runelightReactPreviewQuery) && isRunelightPreviewMode()
          ? { previewImportQuery: runelightReactPreviewQuery }
          : {}),
        root,
      })

      return transformed ? { code: transformed.code, map: null } : null
    },
    hotUpdate(this: ViteLikeHotUpdateHookContext, context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      if (!isRunelightDevMode()) return undefined

      return handleRunelightHotUpdate(context, {
        hot: this.environment?.hot ?? context.server.ws,
        moduleGraph: this.environment?.moduleGraph ?? context.server.moduleGraph,
      })
    },
    handleHotUpdate(context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      if (!isRunelightDevMode()) return undefined

      return handleRunelightHotUpdate(context, {
        hot: context.server.ws,
        moduleGraph: context.server.moduleGraph,
      })
    },
    async generateBundle(this: ViteLikePluginContext, _outputOptions: unknown, bundle: ViteLikeOutputBundle) {
      if (!isRunelightProductionExposeMode() || !productionPreviewEntryReference) return

      await emitRunelightProductionAssets(this, bundle, {
        config: requireResolvedConfig(),
        previewEntryReference: productionPreviewEntryReference,
        root,
        sourceRoot: sourceRoot(),
        studioAppDirectory: options.studioAppDirectory,
        tsconfigPath: options.tsconfigPath ?? resolvedConfig?.project.tsconfig,
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

  function isRunelightPreviewMode(): boolean {
    return isRunelightDevMode() || isRunelightProductionExposeMode()
  }

  function isRunelightProductionExposeMode(): boolean {
    if (isRunelightDevMode() || command !== "build") return false
    if (options.exposeInProduction !== undefined) return options.exposeInProduction
    return optionalResolvedConfig()?.studio.exposeInProduction === true
  }

  function optionalResolvedConfig(): ResolvedRunelightConfig | undefined {
    if (resolvedConfig) return resolvedConfig

    const loaded = loadRunelightConfig(root)
    if (!loaded.config) return undefined

    resolvedConfig = resolveRunelightConfig(loaded.config)
    return resolvedConfig
  }

  function productionPreviewEntryPath(): string {
    return resolve(root, options.previewEntry ?? "src/preview.tsx")
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

function isRunelightDevMode(): boolean {
  return process.env[runelightDevEnvName] === "1"
}

function hasRunelightPreviewQuery(id: string, queryName: string): boolean {
  const query = id.includes("?") ? (id.split("?", 2)[1] ?? "") : ""
  return query.split("&").some((part) => part === queryName || part.startsWith(`${queryName}=`))
}

type RunelightViteStudioRequestOptions = {
  config: ResolvedRunelightConfig
  root: string
  sourceRoot: string
  studioAppDirectory?: string
  tsconfigPath?: string
}

type StudioManifestModule = {
  createStudioManifestFromRunelightConfig(projectIndex: ReturnType<typeof buildRunelightProjectIndex>, config: ResolvedRunelightConfig): StudioManifestLike
}

type StudioStaticAppModule = {
  runelightStudioAppDirectory(): string
  resolveRunelightStudioAppAssetPath(assetPath?: string): string
}

type StudioManifestLike = {
  preview: {
    allUrlTemplate?: string
    urlTemplate: string
  }
  routes: {
    manifest: string
    preview: string
    studio: string
  }
}

type RunelightProductionAssetOptions = {
  config: ResolvedRunelightConfig
  previewEntryReference: string
  root: string
  sourceRoot: string
  studioAppDirectory?: string
  tsconfigPath?: string
}

const studioManifestModuleId = "@runelight/studio/manifest"
const studioStaticAppModuleId = "@runelight/studio/static-app"

async function emitRunelightProductionAssets(
  context: ViteLikePluginContext,
  bundle: ViteLikeOutputBundle,
  options: RunelightProductionAssetOptions,
): Promise<void> {
  const previewEntryFileName = context.getFileName(options.previewEntryReference)
  const previewEntryChunk = bundle[previewEntryFileName]
  const previewEntryCss = previewEntryChunk?.type === "chunk" ? [...(previewEntryChunk.viteMetadata?.importedCss ?? [])] : []

  context.emitFile({
    fileName: "runelight/index.html",
    source: productionHtml({
      scripts: [previewEntryFileName],
      styles: previewEntryCss,
      title: "Runelight Preview",
    }),
    type: "asset",
  })

  await emitRunelightProductionStudio(context, options)
  await emitRunelightProductionManifest(context, options)
}

async function emitRunelightProductionStudio(context: ViteLikePluginContext, options: RunelightProductionAssetOptions): Promise<void> {
  const studioAppDirectory = await resolveRunelightStudioAppDirectory(options)

  for (const filePath of listFilesRecursive(studioAppDirectory)) {
    const relativePath = normalizePath(relative(studioAppDirectory, filePath))
    context.emitFile({
      fileName: `runelight/studio/${relativePath}`,
      source: readFileSync(filePath),
      type: "asset",
    })
  }
}

async function emitRunelightProductionManifest(context: ViteLikePluginContext, options: RunelightProductionAssetOptions): Promise<void> {
  const projectIndex = buildRunelightProjectIndex({
    additionalRoots: [runelightDesignRootFromEntryRoot(requireRunelightEntryRoot(options.config))],
    cwd: options.root,
    sourceRoot: options.sourceRoot,
    tsconfigPath: options.tsconfigPath,
  })
  const { createStudioManifestFromRunelightConfig } = await import(studioManifestModuleId) as StudioManifestModule
  const manifest = createStudioManifestFromRunelightConfig(projectIndex, options.config)
  manifest.routes.preview = trailingSlashRoute(manifest.routes.preview)
  manifest.routes.studio = trailingSlashRoute(manifest.routes.studio)
  manifest.preview = {
    allUrlTemplate: appendPreviewSearchTemplate(manifest.routes.preview, "entry={entry}{frameOverrides}"),
    urlTemplate: appendPreviewSearchTemplate(manifest.routes.preview, "entry={entry}&frame={frame}{frameOverrides}"),
  }

  context.emitFile({
    fileName: normalizePath(options.config.routes.manifest).replace(/^\//, ""),
    source: `${JSON.stringify(manifest)}\n`,
    type: "asset",
  })
}

async function resolveRunelightStudioAppDirectory(options: Pick<RunelightProductionAssetOptions, "studioAppDirectory">): Promise<string> {
  if (options.studioAppDirectory) return options.studioAppDirectory

  const { runelightStudioAppDirectory } = await import(studioStaticAppModuleId) as StudioStaticAppModule
  return runelightStudioAppDirectory()
}

function listFilesRecursive(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(path))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }

  return files
}

function productionPreviewEntryCode(previewEntryPath: string): string {
  return [
    'import { createRoot } from "react-dom/client"',
    'import { jsx } from "react/jsx-runtime"',
    `import { RunelightPreviewApp } from ${JSON.stringify(previewEntryPath)}`,
    "",
    'createRoot(document.getElementById("root")).render(jsx(RunelightPreviewApp, {}))',
    "",
  ].join("\n")
}

function productionHtml(input: { scripts: string[]; styles: string[]; title: string }): string {
  const styles = input.styles.map((fileName) => `    <link rel="stylesheet" crossorigin href="/${fileName}" />`).join("\n")
  const scripts = input.scripts.map((fileName) => `    <script type="module" crossorigin src="/${fileName}"></script>`).join("\n")
  const head = [styles, scripts].filter(Boolean).join("\n")

  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${escapeHtml(input.title)}</title>`,
    head,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    "  </body>",
    "</html>",
    "",
  ].join("\n")
}

function productionExposeRedirectScript(config: ResolvedRunelightConfig): string {
  const previewRoute = config.routes.preview.replace(/\/+$/, "")
  const studioRoute = config.routes.studio.replace(/\/+$/, "")

  return [
    "(() => {",
    `  const redirects = ${JSON.stringify([[previewRoute, `${previewRoute}/`], [studioRoute, `${studioRoute}/`]])};`,
    "  for (const [from, to] of redirects) {",
    "    if (window.location.pathname === from) {",
    "      window.location.replace(`${to}${window.location.search}${window.location.hash}`);",
    "      return;",
    "    }",
    "  }",
    "})();",
  ].join("\n")
}

function appendPreviewSearchTemplate(url: string, template: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${template}`
}

function trailingSlashRoute(route: string): string {
  const [path, search = ""] = route.split("?", 2)
  const normalizedPath = (path || "/").replace(/\/+$/, "")
  return `${normalizedPath || "/"}${normalizedPath === "/" ? "" : "/"}${search ? `?${search}` : ""}`
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function normalizePath(path: string): string {
  return path.split(sep).join("/")
}

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
