import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, writeFileSync, type Dirent, type FSWatcher } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { createRequire } from "node:module"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
  loadRunelightConfig,
  resolveRunelightConfig,
  runelightBaselineRootFromEntryRoot,
  runelightGeneratedRootFromEntryRoot,
} from "@runelight/core/config"
import {
  normalizeRunelightPath,
  runelightDesignRootFromEntryRoot,
  type RunelightConfig,
} from "@runelight/core"
import { isRunelightNextRouteEnabled } from "./route-enablement.js"

type WebpackRule = {
  enforce?: string
  test?: RegExp
  use?: Array<{ loader: string; options?: Record<string, unknown> }>
}

type WebpackConfig = {
  module?: {
    rules?: WebpackRule[]
  }
  plugins?: unknown[]
  resolve?: {
    alias?: Record<string, string>
    [key: string]: unknown
  }
  [key: string]: unknown
}

type NextWebpackConfig = (config: any, context: any) => any

type TurbopackRuleConfigItem = {
  loaders?: Array<string | { loader: string; options?: Record<string, unknown> }>
  as?: string
  type?: string
  [key: string]: unknown
}

type NextConfigLike = {
  rewrites?: (() => unknown | Promise<unknown>) | unknown
  serverExternalPackages?: string[]
  webpack?: NextWebpackConfig | null
  turbopack?: any
  [key: string]: any
}

export type RunelightNextReactOptions = {
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal setup should call `runelightNextReact()` without statically importing Runelight config.
   */
  config?: RunelightConfig
  /**
   * @internal Adapter escape hatch for tests or nonstandard host wiring. Normal setup should let the adapter generate preview entries.
   */
  previewEntries?: false
  /**
   * @internal Test and nonstandard host wiring escape hatch. Normal setup should let the adapter use the project working directory.
   */
  root?: string
}

type ResolvedRunelightNextPreviewEntriesOptions = {
  baselineRoot: string
  entryRoot: string
  outputPath: string
  sourceRoot: string
}

const defaultPreviewEntriesModuleId = "@runelight/adapter-next-react/preview-entries"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".runelight"])
const previewEntriesPluginName = "RunelightNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const runelightDevEnvName = "RUNELIGHT_DEV"
// Adapter-owned Next server glue; setup should not ask users to add this manually.
const runelightServerExternalPackages = ["@runelight/core", "@runelight/studio"]
const globalPreviewEntryWatcherSymbol = Symbol.for("runelight.next.preview-entry.watchers")
const globalStudioEventsServerSymbol = Symbol.for("runelight.next.studio.events.servers")
const previewImportQuery = "runelight-preview"
const runelightNextAdapterSubpathFiles = {
  "@runelight/adapter-next-react/preview": "preview",
  "@runelight/adapter-next-react/preview-route": "preview-route",
  "@runelight/adapter-next-react/studio-manifest-route": "studio-manifest-route",
  "@runelight/adapter-next-react/studio-route": "studio-route",
} as const

type GlobalPreviewEntryWatcher = typeof globalThis & {
  [globalPreviewEntryWatcherSymbol]?: Map<string, { close(): void }>
}

type RunelightNextStudioEventsServer = {
  close(): void
  publish(): void
  url(): Promise<string>
}

type StudioManifestServerModule = {
  createStudioWorkspaceChangesProvider(options?: { config?: RunelightConfig; cwd?: string }): Promise<() => Promise<unknown>>
}

type RunelightNextStudioChangesProviderLoader = () => Promise<() => Promise<unknown>>

type GlobalStudioEventsServer = typeof globalThis & {
  [globalStudioEventsServerSymbol]?: Map<string, RunelightNextStudioEventsServer>
}

export function runelightNextReact(
  options: RunelightNextReactOptions = {},
): <Config extends NextConfigLike>(nextConfig?: Config) => Config & NextConfigLike {
  const root = options.root ?? process.cwd()
  const runelightDevEnabled = isRunelightNextRouteEnabled({ config: options.config, cwd: root })

  const loaderPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loader.cjs")
  const transformPath = resolveRunelightReactTransform(root)
  const previewEntries = runelightDevEnabled ? resolvePreviewEntriesOptions(root, options) : undefined

  return function withRunelightNextReact<Config extends NextConfigLike>(nextConfig: Config = {} as Config): Config & NextConfigLike {
    const userWebpack = nextConfig.webpack
    const studioEventsServer = startRunelightNextStudioEventsServer(root, previewEntries, options.config)
    writeRunelightNextPreviewEntries(root, previewEntries)
    startRunelightNextPreviewEntriesWatcher(root, previewEntries)

    return {
      ...nextConfig,
      webpack(config: WebpackConfig, context: any) {
        writeRunelightNextPreviewEntries(root, previewEntries)
        const resolvedConfig = (typeof userWebpack === "function" ? userWebpack(config, context) : config) as WebpackConfig
        resolvedConfig.module ??= {}
        resolvedConfig.module.rules ??= []
        resolvedConfig.resolve ??= {}
        resolvedConfig.resolve.alias = {
          ...(resolvedConfig.resolve.alias ?? {}),
          ...(previewEntries ? { [defaultPreviewEntriesModuleId]: previewEntries.outputPath } : {}),
        }
        installRunelightNextPreviewEntriesPlugin(resolvedConfig, root, previewEntries)
        resolvedConfig.module.rules.unshift({
          test: /\.g\.tsx$/,
          enforce: "pre",
          use: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath } }],
        })
        return resolvedConfig
      },
      rewrites: withRunelightNextStudioEventsRewrites(nextConfig.rewrites, studioEventsServer, previewEntries),
      serverExternalPackages: withRunelightServerExternalPackages(nextConfig.serverExternalPackages),
      turbopack: withRunelightTurbopackConfig(
        nextConfig.turbopack,
        loaderPath,
        root,
        transformPath,
        previewEntries,
      ),
    } as Config & NextConfigLike
  }
}

function withRunelightServerExternalPackages(serverExternalPackages: string[] | undefined): string[] {
  const merged = [...(serverExternalPackages ?? [])]
  for (const packageName of runelightServerExternalPackages) {
    if (!merged.includes(packageName)) merged.push(packageName)
  }
  return merged
}

function withRunelightTurbopackConfig(
  turbopack: NextConfigLike["turbopack"],
  loaderPath: string,
  root: string,
  transformPath: string,
  previewEntries: ResolvedRunelightNextPreviewEntriesOptions | undefined,
): NonNullable<NextConfigLike["turbopack"]> {
  const runelightRule: TurbopackRuleConfigItem = {
    loaders: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath, transpilePreview: true } }],
  }
  const rules = turbopack?.rules ?? {}

  return {
    ...turbopack,
    ...(turbopack?.root ? {} : runelightNextTurbopackRootOption(root)),
    resolveAlias: {
      ...(turbopack?.resolveAlias ?? {}),
      ...runelightNextAdapterTurbopackResolveAliases(root),
      ...(previewEntries ? { [defaultPreviewEntriesModuleId]: toTurbopackResolveAliasPath(root, previewEntries.outputPath) } : {}),
    },
    rules: {
      ...rules,
      "*.g.tsx": prependRule(runelightRule, rules["*.g.tsx"]),
    },
  }
}

function runelightNextAdapterTurbopackResolveAliases(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(runelightNextAdapterSubpathFiles).map(([moduleId, fileName]) => [
      moduleId,
      toTurbopackResolveAliasPath(root, resolve(root, `node_modules/@runelight/adapter-next-react/dist/${fileName}.js`)),
    ]),
  )
}

function runelightNextTurbopackRootOption(root: string): { root: string } | Record<string, never> {
  const projectRoot = realpathIfExists(root) ?? resolve(root)
  const adapterFile = realpathIfExists(resolve(root, "node_modules/@runelight/adapter-next-react/dist/preview.js"))
  if (!adapterFile || isPathInsideDirectory(adapterFile, projectRoot)) return {}

  return { root: commonPathAncestor(projectRoot, adapterFile) }
}

function realpathIfExists(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

function isPathInsideDirectory(path: string, directory: string): boolean {
  const normalizedPath = resolve(path)
  const normalizedDirectory = resolve(directory)
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}${sep}`)
}

function commonPathAncestor(left: string, right: string): string {
  const leftParts = resolve(left).split(sep)
  const rightParts = resolve(right).split(sep)
  const common: string[] = []
  const length = Math.min(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    if (leftParts[index] !== rightParts[index]) break
    common.push(leftParts[index] as string)
  }

  if (common.length === 0) return resolve(sep)
  if (common.length === 1 && common[0] === "") return sep
  return common.join(sep) || sep
}

function prependRule(
  rule: TurbopackRuleConfigItem,
  existing: TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> | undefined,
): TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

function resolveRunelightReactTransform(root: string): string {
  return createRequire(import.meta.url).resolve("@runelight/react/contract", {
    paths: [root, process.cwd()],
  })
}

function resolvePreviewEntriesOptions(
  root: string,
  options: RunelightNextReactOptions,
): ResolvedRunelightNextPreviewEntriesOptions | undefined {
  if (options.previewEntries === false) return undefined

  const resolvedConfig = resolveNextRunelightConfig(root, options.config)
  const entryRoot = resolvedConfig?.project.entryRoot
  if (!entryRoot) {
    throw new Error(
      'Missing project.entryRoot in runelight.config.ts. Record the local /runelight entry directory, for example project: { entryRoot: "src/app/runelight" } for src-based projects.',
    )
  }

  const normalizedEntryRoot = normalizeRunelightPath(entryRoot)

  return {
    baselineRoot: runelightBaselineRootFromEntryRoot(normalizedEntryRoot),
    entryRoot: normalizedEntryRoot,
    outputPath: resolve(root, `${runelightGeneratedRootFromEntryRoot(normalizedEntryRoot)}/preview-entries.ts`),
    sourceRoot: resolvedConfig.project.sourceRoot,
  }
}

function resolveNextRunelightConfig(root: string, config: RunelightConfig | undefined) {
  if (config) return resolveRunelightConfig(config)

  const loaded = loadRunelightConfig(root)
  if (loaded.config) return resolveRunelightConfig(loaded.config)

  const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
  throw new Error(message || "Missing runelight.config.ts for Next adapter.")
}

function writeRunelightNextPreviewEntries(root: string, options: ResolvedRunelightNextPreviewEntriesOptions | undefined) {
  if (!options || !existsSync(root)) return

  prepareRunelightNextBaselineSource(root, options)
  const files = discoverRunelightPreviewFiles(root, options)
  const code = createRunelightNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverRunelightPreviewFiles(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): string[] {
  const files = new Set<string>()

  for (const previewRoot of runelightNextPreviewEntryRoots(options)) {
    collectRunelightPreviewFiles(resolve(root, previewRoot), files, root)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectRunelightPreviewFiles(directory: string, files: Set<string>, root: string) {
  if (!existsSync(directory)) return

  walk(directory)

  function walk(currentDirectory: string) {
    for (const dirent of readdirSync(currentDirectory, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!ignoredPreviewEntryDirs.has(dirent.name)) {
          walk(resolve(currentDirectory, dirent.name))
        }
        continue
      }

      if (dirent.isFile() && dirent.name.endsWith(".g.tsx")) {
        files.add(relative(root, resolve(currentDirectory, dirent.name)).split(sep).join("/"))
      }
    }
  }
}

function runelightNextPreviewEntryRoots(options: ResolvedRunelightNextPreviewEntriesOptions): string[] {
  const designRoot = runelightDesignRootFromEntryRoot(options.entryRoot)
  return [...new Set([options.sourceRoot, designRoot, `${options.baselineRoot}/${options.sourceRoot}`, `${options.baselineRoot}/${designRoot}`])]
}

function runelightNextPreviewEntryWatchRoots(options: ResolvedRunelightNextPreviewEntriesOptions): string[] {
  return [...new Set([options.sourceRoot, options.entryRoot, runelightDesignRootFromEntryRoot(options.entryRoot)])]
}

class RunelightNextPreviewEntriesPlugin {
  constructor(
    private readonly root: string,
    private readonly options: ResolvedRunelightNextPreviewEntriesOptions | undefined,
  ) {}

  apply(compiler: {
    hooks?: {
      afterCompile?: { tap(name: string, handler: (compilation: any) => void): void }
      beforeRun?: { tap(name: string, handler: () => void): void }
      watchRun?: { tap(name: string, handler: () => void): void }
    }
  }) {
    compiler.hooks?.beforeRun?.tap(previewEntriesPluginName, () => writeRunelightNextPreviewEntries(this.root, this.options))
    compiler.hooks?.watchRun?.tap(previewEntriesPluginName, () => writeRunelightNextPreviewEntries(this.root, this.options))
    compiler.hooks?.afterCompile?.tap(previewEntriesPluginName, (compilation: any) => {
      if (!this.options) return

      for (const watchRoot of runelightNextPreviewEntryWatchRoots(this.options)) {
        const absoluteWatchRoot = resolve(this.root, watchRoot)
        if (existsSync(absoluteWatchRoot)) {
          compilation.contextDependencies?.add(absoluteWatchRoot)
        }
      }

      if (existsSync(this.options.outputPath)) {
        compilation.fileDependencies?.add(this.options.outputPath)
      }
    })
  }
}

function installRunelightNextPreviewEntriesPlugin(
  config: WebpackConfig,
  root: string,
  options: ResolvedRunelightNextPreviewEntriesOptions | undefined,
) {
  if (!options) return

  config.plugins ??= []
  if (config.plugins.some((plugin) => plugin instanceof RunelightNextPreviewEntriesPlugin)) return
  config.plugins.push(new RunelightNextPreviewEntriesPlugin(root, options))
}

function startRunelightNextPreviewEntriesWatcher(root: string, options: ResolvedRunelightNextPreviewEntriesOptions | undefined) {
  if (!options || process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return

  const key = JSON.stringify({
    baselineRoot: options.baselineRoot,
    entryRoot: options.entryRoot,
    outputPath: options.outputPath,
    sourceRoot: options.sourceRoot,
    root,
  })
  const watchers = globalPreviewEntryWatchers()
  if (watchers.has(key)) return

  ensureRunelightDesignDirectory(root, options)
  writeRunelightNextPreviewEntries(root, options)
  const watcher = watchRunelightNextPreviewEntryRoots(root, options)
  watchers.set(key, watcher)
}

function globalPreviewEntryWatchers(): Map<string, { close(): void }> {
  const globalWatchers = globalThis as GlobalPreviewEntryWatcher
  globalWatchers[globalPreviewEntryWatcherSymbol] ??= new Map()
  return globalWatchers[globalPreviewEntryWatcherSymbol]
}

function watchRunelightNextPreviewEntryRoots(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): { close(): void } {
  let pending: ReturnType<typeof setTimeout> | undefined
  const directoryWatchers = new Map<string, FSWatcher>()

  const scheduleWrite = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = undefined
      writeRunelightNextPreviewEntries(root, options)
      notifyRunelightNextStudioManifestChange(root, options)
    }, previewEntriesWatcherDebounceMs)
    pending.unref?.()
  }

  const watchDirectory = (directory: string) => {
    if (directoryWatchers.has(directory)) return

    let dirents: Dirent[]
    try {
      dirents = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    let watcher: FSWatcher
    try {
      watcher = watch(directory, (eventType, filename) => {
        const changedPath = typeof filename === "string" ? resolve(directory, filename) : directory
        const changedStat = statOrUndefined(changedPath)

        if (changedStat?.isDirectory()) {
          watchDirectoryTree(changedPath)
        }

        if (!filename || changedPath.endsWith(".g.tsx") || changedStat?.isDirectory() || eventType === "rename") {
          scheduleWrite()
        }
      })
    } catch {
      return
    }
    watcher.unref?.()
    directoryWatchers.set(directory, watcher)

    for (const dirent of dirents) {
      if (dirent.isDirectory() && !ignoredPreviewEntryDirs.has(dirent.name)) {
        watchDirectoryTree(resolve(directory, dirent.name))
      }
    }
  }

  const watchDirectoryTree = (directory: string, options: { allowIgnoredRoot?: boolean } = {}) => {
    if (!options.allowIgnoredRoot && ignoredPreviewEntryDirs.has(directory.split(sep).at(-1) ?? "")) return
    watchDirectory(directory)
  }

  for (const watchRoot of runelightNextPreviewEntryWatchRoots(options)) {
    watchDirectoryTree(resolve(root, watchRoot), { allowIgnoredRoot: true })
  }

  return {
    close() {
      if (pending) clearTimeout(pending)
      for (const watcher of directoryWatchers.values()) {
        watcher.close()
      }
      directoryWatchers.clear()
    },
  }
}

function withRunelightNextStudioEventsRewrites(
  userRewrites: NextConfigLike["rewrites"],
  studioEventsServer: RunelightNextStudioEventsServer | undefined,
  options: ResolvedRunelightNextPreviewEntriesOptions | undefined,
): NextConfigLike["rewrites"] {
  if (!studioEventsServer || !options) return userRewrites

  return async () => {
    const rewrites = typeof userRewrites === "function" ? await userRewrites() : userRewrites
    const serverUrl = await studioEventsServer.url()
    return prependNextRewrites(rewrites, [
      {
        destination: `${serverUrl}${runelightNextStudioEventsRoute()}`,
        source: runelightNextStudioEventsRoute(),
      },
      {
        destination: `${serverUrl}${runelightNextStudioChangesRoute()}`,
        source: runelightNextStudioChangesRoute(),
      },
    ])
  }
}

function prependNextRewrites(rewrites: unknown, prepended: Array<{ destination: string; source: string }>): unknown {
  return prepended.reduceRight((nextRewrites, rewrite) => prependNextRewrite(nextRewrites, rewrite), rewrites)
}

function prependNextRewrite(rewrites: unknown, rewrite: { destination: string; source: string }): unknown {
  if (!rewrites) return [rewrite]
  if (Array.isArray(rewrites)) return [rewrite, ...rewrites]
  if (typeof rewrites === "object") {
    const rewriteGroups = rewrites as { afterFiles?: unknown[]; beforeFiles?: unknown[]; fallback?: unknown[] }
    return {
      ...rewriteGroups,
      beforeFiles: [rewrite, ...(Array.isArray(rewriteGroups.beforeFiles) ? rewriteGroups.beforeFiles : [])],
    }
  }

  return [rewrite]
}

function startRunelightNextStudioEventsServer(
  root: string,
  options: ResolvedRunelightNextPreviewEntriesOptions | undefined,
  config: RunelightConfig | undefined,
): RunelightNextStudioEventsServer | undefined {
  if (!options || !isRunelightDevMode()) return undefined

  const key = runelightNextPreviewEntriesKey(root, options)
  const servers = globalStudioEventsServers()
  const existing = servers.get(key)
  if (existing) return existing

  const hub = createRunelightStudioEventHub()
  let changesProviderPromise: Promise<() => Promise<unknown>> | undefined
  const getChangesProvider = () => {
    changesProviderPromise ??= createRunelightNextStudioChangesProvider({ config, root })
    return changesProviderPromise
  }
  const server: Server = createServer((request, response) => {
    if (request.method && request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405
      response.end("Method not allowed.")
      return
    }

    const pathname = requestPathname(request.url)
    if (pathname === runelightNextStudioEventsRoute()) {
      serveRunelightNextStudioEvents(request, response, hub)
      return
    }

    if (pathname === runelightNextStudioChangesRoute()) {
      void serveRunelightNextStudioChanges(response, { getChangesProvider, previewEntries: options, root })
      return
    }

    {
      response.statusCode = 404
      response.end("Runelight Studio event stream not found.")
      return
    }
  })
  const url = new Promise<string>((resolveUrl, rejectUrl) => {
    server.once("error", rejectUrl)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectUrl)
      server.unref?.()
      const address = server.address()
      if (!address || typeof address === "string") {
        rejectUrl(new Error("Unable to start Runelight Studio event stream."))
        return
      }
      resolveUrl(`http://127.0.0.1:${address.port}`)
    })
  })
  const studioEventsServer = {
    close() {
      server.close()
    },
    publish: hub.publish,
    url: () => url,
  }

  servers.set(key, studioEventsServer)
  return studioEventsServer
}

async function serveRunelightNextStudioChanges(
  response: ServerResponse,
  options: {
    getChangesProvider: RunelightNextStudioChangesProviderLoader
    previewEntries?: ResolvedRunelightNextPreviewEntriesOptions
    root: string
  },
): Promise<void> {
  try {
    const createChanges = await options.getChangesProvider()
    const changes = await createChanges()
    writeRunelightNextPreviewEntries(options.root, options.previewEntries)
    response.statusCode = 200
    response.setHeader("cache-control", "no-store")
    response.setHeader("content-type", "application/json; charset=utf-8")
    response.end(JSON.stringify(changes))
  } catch (error) {
    response.statusCode = 500
    response.setHeader("content-type", "text/plain; charset=utf-8")
    response.end(error instanceof Error ? error.message : "Runelight Studio changes request failed.")
  }
}

async function createRunelightNextStudioChangesProvider(options: {
  config?: RunelightConfig
  root: string
}): Promise<() => Promise<unknown>> {
  const { createStudioWorkspaceChangesProvider } = await import("@runelight/studio/manifest-server") as unknown as StudioManifestServerModule
  return createStudioWorkspaceChangesProvider({ config: options.config, cwd: options.root })
}

function globalStudioEventsServers(): Map<string, RunelightNextStudioEventsServer> {
  const globalServers = globalThis as GlobalStudioEventsServer
  globalServers[globalStudioEventsServerSymbol] ??= new Map()
  return globalServers[globalStudioEventsServerSymbol]
}

function notifyRunelightNextStudioManifestChange(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): void {
  globalStudioEventsServers().get(runelightNextPreviewEntriesKey(root, options))?.publish()
}

type RunelightStudioEventHub = {
  publish(): void
  subscribe(response: ServerResponse): () => void
}

function createRunelightStudioEventHub(): RunelightStudioEventHub {
  const clients = new Set<ServerResponse>()

  return {
    publish() {
      for (const client of clients) {
        client.write("event: manifest\ndata: {}\n\n")
      }
    },
    subscribe(response) {
      clients.add(response)
      response.write(": connected\n\n")
      return () => {
        clients.delete(response)
      }
    },
  }
}

function serveRunelightNextStudioEvents(
  request: IncomingMessage,
  response: ServerResponse,
  studioEvents: RunelightStudioEventHub,
): void {
  response.statusCode = 200
  response.setHeader("cache-control", "no-store")
  response.setHeader("connection", "keep-alive")
  response.setHeader("content-type", "text/event-stream; charset=utf-8")
  response.setHeader("x-accel-buffering", "no")

  if (request.method === "HEAD") {
    response.end()
    return
  }

  const unsubscribe = studioEvents.subscribe(response)
  request.on("close", unsubscribe)
}

function runelightNextPreviewEntriesKey(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): string {
  return JSON.stringify({
    baselineRoot: options.baselineRoot,
    entryRoot: options.entryRoot,
    outputPath: options.outputPath,
    sourceRoot: options.sourceRoot,
    root,
  })
}

function runelightNextStudioEventsRoute(): string {
  return "/runelight/studio/events"
}

function runelightNextStudioChangesRoute(): string {
  return "/runelight/studio/changes"
}

function requestPathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://runelight.local").pathname
}

function isRunelightDevMode(): boolean {
  return process.env[runelightDevEnvName] === "1"
}

function createRunelightNextPreviewEntriesModule(root: string, outputPath: string, files: string[]): string {
  const entries = files.map((filePath) => {
    const absoluteFilePath = resolve(root, filePath)
    return `  ${JSON.stringify(filePath)}: () => import(${JSON.stringify(toGeneratedImportSpecifier(outputPath, absoluteFilePath, previewImportQuery))}),`
  })

  return `import type { RunelightReactPreviewComponent } from "@runelight/adapter-next-react/preview"

type RunelightNextPreviewModule = Record<string, unknown>
type RunelightNextPreviewEntryLoader = () => Promise<RunelightNextPreviewModule>
type RunelightNextPreviewEntryLoaders = Record<string, RunelightNextPreviewEntryLoader>

const runelightNextPreviewEntryLoaders = {
${entries.join("\n")}
} satisfies RunelightNextPreviewEntryLoaders

export async function loadRunelightNextPreviewComponent(entry: string): Promise<RunelightReactPreviewComponent | undefined> {
  const { file, exportName } = parseRunelightNextPreviewEntry(entry)
  const loader = (runelightNextPreviewEntryLoaders as RunelightNextPreviewEntryLoaders)[file]
  if (!loader) return undefined

  const moduleValue = await loader()
  const component = moduleValue[exportName]
  return typeof component === "function" ? (component as RunelightReactPreviewComponent) : undefined
}

function parseRunelightNextPreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}
`
}

function toGeneratedImportSpecifier(outputPath: string, absoluteFilePath: string, previewQuery: string): string {
  const extensionless = absoluteFilePath.replace(/\.tsx$/, "")
  const relativePath = relative(dirname(outputPath), extensionless).split(sep).join("/")
  const specifier = relativePath.startsWith(".") ? relativePath : `./${relativePath}`
  return `${specifier}?${previewQuery}`
}

function toTurbopackResolveAliasPath(root: string, outputPath: string): string {
  const relativePath = relative(root, outputPath).split(sep).join("/")
  return relativePath.startsWith("./") || relativePath.startsWith("../") ? relativePath : `./${relativePath}`
}

function readFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function statOrUndefined(path: string) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

function ensureRunelightDesignDirectory(root: string, options: ResolvedRunelightNextPreviewEntriesOptions) {
  mkdirSync(resolve(root, runelightDesignRootFromEntryRoot(options.entryRoot)), { recursive: true })
}

function prepareRunelightNextBaselineSource(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): void {
  if (!isRunelightDevMode()) return

  const cacheKey = runelightNextBaselineSourceCacheKey(root, options)
  const cacheKeyPath = resolve(root, options.baselineRoot, ".baseline-key")
  if (readFileIfExists(cacheKeyPath) === cacheKey) return

  const roots = [options.sourceRoot, runelightDesignRootFromEntryRoot(options.entryRoot)]
  const filePaths = readRunelightNextGitHeadFiles(root, roots)
  if (filePaths.length === 0) return

  for (const filePath of filePaths) {
    const content = readRunelightNextGitHeadFile(root, filePath)
    if (!content) continue

    const outputPath = resolve(root, options.baselineRoot, filePath)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(
      outputPath,
      shouldRewriteRunelightNextBaselineImports(filePath)
        ? rewriteRunelightNextBaselineImports(content.toString("utf8"), {
            baselineRoot: options.baselineRoot,
            filePath,
            runtimeImportSpecifier: "@runelight/react/runtime",
            sourceRoot: options.sourceRoot,
          })
        : content,
    )
  }
  mkdirSync(resolve(root, options.baselineRoot), { recursive: true })
  writeFileSync(cacheKeyPath, cacheKey)
}

function runelightNextBaselineSourceCacheKey(root: string, options: ResolvedRunelightNextPreviewEntriesOptions): string {
  return JSON.stringify({
    baselineRoot: options.baselineRoot,
    entryRoot: options.entryRoot,
    head: readRunelightNextGitHeadRevision(root),
    runtimeImportSpecifier: "@runelight/react/runtime",
    sourceRoot: options.sourceRoot,
  })
}

function readRunelightNextGitHeadRevision(root: string): string | undefined {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function readRunelightNextGitHeadFiles(root: string, pathspecs: string[]): string[] {
  let output: string
  try {
    output = execFileSync("git", ["-C", root, "ls-tree", "-r", "--name-only", "HEAD", "--", ...pathspecs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return []
  }

  return output.split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/"))
}

function readRunelightNextGitHeadFile(root: string, path: string): Buffer | undefined {
  try {
    return execFileSync("git", ["-C", root, "show", `HEAD:${path}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    }) as Buffer
  } catch {
    return undefined
  }
}

function shouldRewriteRunelightNextBaselineImports(path: string): boolean {
  return /\.(c|m)?(t|j)sx?$/.test(path)
}

function rewriteRunelightNextBaselineImports(
  source: string,
  options: { baselineRoot: string; filePath: string; runtimeImportSpecifier?: string; sourceRoot: string },
): string {
  const aliasRewritten = source
    .replaceAll(/(from\s*["'])@\/([^"']+)(["'])/g, (_match, before: string, target: string, after: string) =>
      `${before}${runelightNextBaselineRelativeAliasSpecifier(options, target)}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@\/([^"']+)(["']\s*\))/g, (_match, before: string, target: string, after: string) =>
      `${before}${runelightNextBaselineRelativeAliasSpecifier(options, target)}${after}`)
  if (!options.runtimeImportSpecifier || !isRunelightNextBaselineProtocolFile(options.filePath)) return aliasRewritten

  return aliasRewritten
    .replaceAll(/(from\s*["'])@runelight\/core(["'])/g, (_match, before: string, after: string) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@runelight\/core(["']\s*\))/g, (_match, before: string, after: string) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
}

function runelightNextBaselineRelativeAliasSpecifier(
  options: { baselineRoot: string; filePath: string; sourceRoot: string },
  target: string,
): string {
  const fromDirectory = dirname(`${options.baselineRoot}/${options.filePath}`)
  const toPath = `${options.baselineRoot}/${options.sourceRoot}/${target}`.replaceAll("\\", "/")
  const relativePath = relative(fromDirectory, toPath).split(sep).join("/")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

function isRunelightNextBaselineProtocolFile(path: string): boolean {
  return path.endsWith(".g.tsx")
}
