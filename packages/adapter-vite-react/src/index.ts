import { relative, resolve, sep } from "node:path"
import { mkdirSync } from "node:fs"

import { buildGTSXProjectIndex } from "@gtsx/core/project-index"
import { transformGTSXReactModule } from "@gtsx/core/react-transform"
import { loadGTSXConfig, resolveGTSXConfig } from "@gtsx/core/config"
import { gtsxDesignRootFromEntryRoot, normalizeGTSXPath, requireGTSXEntryRoot } from "@gtsx/core/config-model"
import type { GTSXConfig, ResolvedGTSXConfig } from "@gtsx/core"

export { transformGTSXComponentBoundaries, transformGTSXReactModule } from "@gtsx/core/react-transform"

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

type ViteLikeDevServer = {
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

type GTSXViteReactOptions = {
  config?: GTSXConfig
  entryRoot?: string
  sourceRoot?: string
  root?: string
  tsconfigPath?: string
}

export function gtsxViteReact(options: GTSXViteReactOptions = {}) {
  let root = options.root ?? process.cwd()
  let resolvedConfig = options.config ? resolveGTSXConfig(options.config) : undefined
  const virtualProjectIndexId = "virtual:gtsx/project-index"
  const virtualConfigId = "virtual:gtsx/config"
  const resolvedVirtualProjectIndexId = `\0${virtualProjectIndexId}`
  const resolvedVirtualConfigId = `\0${virtualConfigId}`

  return {
    name: "@gtsx/adapter-vite-react",
    enforce: "pre" as const,
    config() {
      return {
        optimizeDeps: {
          include: ["react-tracked", "scheduler", "use-context-selector"],
          exclude: ["@gtsx/adapter-vite-react", "typescript", virtualConfigId, virtualProjectIndexId],
        },
      }
    },
    configResolved(config: ViteLikeConfig) {
      root = options.root ?? config.root
    },
    configureServer(server: ViteLikeDevServer) {
      ensureGTSXDesignDirectory(root, entryRoot())
      server.watcher?.add(gtsxViteWatchRoots(root, sourceRoot(), entryRoot()))
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
      const projectIndex = buildGTSXProjectIndex({
        additionalRoots: [gtsxDesignRootFromEntryRoot(entryRoot())],
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
      const transformed = transformGTSXReactModule({
        code,
        filePath: id,
        root,
      })

      return transformed ? { code: transformed.code, map: null } : null
    },
    hotUpdate(this: ViteLikeHotUpdateHookContext, context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      return handleGTSXHotUpdate(context, {
        hot: this.environment?.hot ?? context.server.ws,
        moduleGraph: this.environment?.moduleGraph ?? context.server.moduleGraph,
      })
    },
    handleHotUpdate(context: ViteLikeHotUpdateOptions): unknown[] | undefined {
      return handleGTSXHotUpdate(context, {
        hot: context.server.ws,
        moduleGraph: context.server.moduleGraph,
      })
    },
  }

  function sourceRoot(): string {
    return options.sourceRoot ?? resolvedConfig?.project.sourceRoot ?? "src"
  }

  function entryRoot(): string {
    return normalizeGTSXPath(options.entryRoot ?? requireGTSXEntryRoot(requireResolvedConfig()))
  }

  function requireResolvedConfig(): ResolvedGTSXConfig {
    if (resolvedConfig) return resolvedConfig

    const loaded = loadGTSXConfig(root)
    if (loaded.config) {
      resolvedConfig = resolveGTSXConfig(loaded.config)
      return resolvedConfig
    }

    const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
    throw new Error(message || "Missing gtsx.config.ts for Vite adapter.")
  }

  function handleGTSXHotUpdate(
    context: ViteLikeHotUpdateOptions,
    environment: { hot?: ViteLikeHotChannel; moduleGraph?: ViteLikeModuleGraph },
  ): unknown[] | undefined {
    if (!isGTSXFileInViteWatchRoots(root, sourceRoot(), entryRoot(), context.file)) return undefined

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

function gtsxViteWatchRoots(root: string, sourceRoot: string, entryRoot: string): string[] {
  const designRoot = gtsxDesignRootFromEntryRoot(entryRoot)
  return [...new Set([sourceRoot, entryRoot, designRoot])].map((watchRoot) =>
    resolve(root, watchRoot),
  )
}

function isGTSXFileInViteWatchRoots(root: string, sourceRoot: string, entryRoot: string, file: string): boolean {
  if (!file.endsWith(".g.tsx")) return false

  const watchRoots = gtsxViteWatchRoots(root, sourceRoot, entryRoot)
  return watchRoots.some((watchRoot) => isPathInside(watchRoot, file))
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath).split(sep).join("/")
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== "..")
}

function ensureGTSXDesignDirectory(root: string, entryRoot: string) {
  mkdirSync(resolve(root, gtsxDesignRootFromEntryRoot(entryRoot)), { recursive: true })
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
