import { relative, resolve, sep } from "node:path"
import type { Plugin } from "vite"

import { buildRunelightProjectIndex } from "@runelight/core/project-index"
import { loadRunelightConfig, resolveRunelightConfig, type ResolvedRunelightConfig, type RunelightConfig } from "@runelight/core/config"
import { resolveRunelightContractReferences } from "@runelight/core/contract"
import { normalizeRunelightPath } from "@runelight/core"
import {
  hasRunelightVuePreviewQuery,
  transformRunelightVuePreviewModule,
} from "@runelight/vue/contract"

type ViteLikeConfig = {
  define?: Record<string, string>
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
  on?(event: "close", listener: () => void): void
  url?: string
}

type ViteLikeResponse = {
  statusCode?: number
  write?(body: string): void
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
    on?(event: "all", listener: (eventName: string, path: string) => void): void
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

type RunelightVitePreviewConfig = {
  project: {
    sourceRoot: string
  }
}

export type RunelightViteVueOptions = {
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal setup should call `runelightViteVue()` without statically importing Runelight config.
   */
  config?: RunelightConfig
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal setup should let Vite provide the project root.
   */
  root?: string
}

const runelightDevEnvName = "RUNELIGHT_DEV"
const runelightProjectKeyEnvName = "RUNELIGHT_PROJECT_KEY"
const runelightSessionIdEnvName = "RUNELIGHT_SESSION_ID"

export function runelightViteVue(options: RunelightViteVueOptions = {}): Plugin {
  let root = options.root ?? process.cwd()
  let runelightConfig = options.config
  let resolvedConfig = options.config ? resolveRunelightConfig(options.config) : undefined
  const virtualProjectIndexId = "virtual:runelight/project-index"
  const virtualPreviewConfigId = "virtual:runelight/preview-config"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`
  const resolvedVirtualPreviewConfigId = `\0${virtualPreviewConfigId}`

  const plugin = {
    name: "@runelight/adapter-vite-vue",
    enforce: "pre" as const,
    config() {
      return {
        define: {
          __RUNELIGHT_DEV__: JSON.stringify(isRunelightDevMode()),
        },
        optimizeDeps: {
          exclude: [
            "@runelight/core",
            "@runelight/vue",
            "@runelight/adapter-vite-vue",
            "typescript",
            virtualPreviewConfigId,
            virtualProjectIndexId,
          ],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    configureServer(server: ViteLikeDevServer) {
      if (!isRunelightDevMode()) return

      server.watcher?.add(runelightViteWatchRoots(root, sourceRoot(), entryRoot()))
      server.middlewares?.use((request, response, next) => {
        const handled = handleRunelightViteSessionRequest(request, response, {
          config: requireResolvedConfig(),
        })
        if (!handled) next()
      })
    },
    resolveId(id: string) {
      if (!isRunelightPreviewMode()) return null

      if (id === virtualProjectIndexId) return resolvedVirtualProjectIndexId
      if (id === virtualPreviewConfigId) return resolvedVirtualPreviewConfigId
      return null
    },
    async load(id: string): Promise<TransformResult | null> {
      if (!isRunelightPreviewMode()) return null

      if (id === resolvedVirtualPreviewConfigId) {
        return {
          code: `export default ${JSON.stringify(createRunelightVitePreviewConfig(requireResolvedConfig()))}\n`,
          map: null,
        }
      }
      if (id === resolvedVirtualProjectIndexId) {
        const projectIndex = await buildRunelightViteProjectIndex({
          config: requireResolvedConfig(),
          root,
          runelightConfig: requireRunelightConfig(),
        })
        return {
          code: `export default ${JSON.stringify(projectIndex)}\n`,
          map: null,
        }
      }

      if (hasRunelightVuePreviewQuery(id)) {
        return null
      }

      return null
    },
    transform(code: string, id: string): TransformResult | null {
      const transformed = transformRunelightVuePreviewModule({
        code,
        filePath: id,
        ...(isRunelightPreviewMode() && hasRunelightVuePreviewQuery(id)
          ? { previewRuntimeImport: "@runelight/adapter-vite-vue/preview" }
          : {}),
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
  }
  return plugin as unknown as Plugin

  function sourceRoot(): string {
    return requireResolvedConfig().project.sourceRoot
  }

  function entryRoot(): string {
    return normalizeRunelightPath(requireResolvedConfig().project.entryRoot)
  }

  function requireResolvedConfig(): ResolvedRunelightConfig {
    if (resolvedConfig) return resolvedConfig

    const config = requireRunelightConfig()
    resolvedConfig = resolveRunelightConfig(config)
    return resolvedConfig
  }

  function requireRunelightConfig(): RunelightConfig {
    if (runelightConfig) return runelightConfig

    const loaded = loadRunelightConfig(root)
    if (loaded.config) {
      runelightConfig = loaded.config
      return runelightConfig
    }

    const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
    throw new Error(message || "Missing runelight.config.ts for Vite Vue adapter.")
  }

  function isRunelightPreviewMode(): boolean {
    return isRunelightDevMode()
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

function createRunelightVitePreviewConfig(config: ResolvedRunelightConfig): RunelightVitePreviewConfig {
  return {
    project: {
      sourceRoot: config.project.sourceRoot,
    },
  }
}

function isRunelightDevMode(): boolean {
  return process.env[runelightDevEnvName] === "1"
}

type RunelightViteSessionRequestOptions = {
  config: ResolvedRunelightConfig
}

function handleRunelightViteSessionRequest(
  request: ViteLikeRequest,
  response: ViteLikeResponse,
  options: RunelightViteSessionRequestOptions,
): boolean {
  if (request.method && request.method !== "GET" && request.method !== "HEAD") return false

  const pathname = requestPathname(request.url)
  if (pathname !== options.config.routes.session) return false

  response.statusCode = 200
  response.setHeader("cache-control", "no-store")
  response.setHeader("content-type", "application/json; charset=utf-8")
  if (request.method === "HEAD") {
    response.end()
    return true
  }

  response.end(JSON.stringify({
    serveSession: {
      projectKey: process.env[runelightProjectKeyEnvName],
      sessionId: process.env[runelightSessionIdEnvName],
    },
  }))
  return true
}

async function buildRunelightViteProjectIndex(
  options: {
    config: ResolvedRunelightConfig
    root: string
    runelightConfig: RunelightConfig
  },
): Promise<ReturnType<typeof buildRunelightProjectIndex>> {
  const contracts = await resolveRunelightContractReferences(options.runelightConfig.contracts, { cwd: options.root })
  return buildRunelightProjectIndex({
    contracts,
    cwd: options.root,
    sourceRoot: options.config.project.sourceRoot,
    tsconfigPath: options.config.project.tsconfig,
  })
}

function requestPathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://runelight.local").pathname
}

function runelightViteWatchRoots(root: string, sourceRoot: string, entryRoot: string): string[] {
  return [...new Set([sourceRoot, entryRoot])].map((watchRoot) =>
    resolve(root, watchRoot),
  )
}

function isRunelightFileInViteWatchRoots(root: string, sourceRoot: string, entryRoot: string, file: string): boolean {
  if (!file.endsWith(".g.vue")) return false

  const watchRoots = runelightViteWatchRoots(root, sourceRoot, entryRoot)
  return watchRoots.some((watchRoot) => isPathInside(watchRoot, file))
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath).split(sep).join("/")
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== "..")
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
