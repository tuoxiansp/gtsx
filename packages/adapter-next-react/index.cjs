"use strict"

const { execFileSync } = require("node:child_process")
const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } = require("node:fs")
const { createServer } = require("node:http")
const { dirname, join, relative, resolve, sep } = require("node:path")
const vm = require("node:vm")

const defaultPreviewEntriesModuleId = "@runelight/adapter-next-react/preview-entries"
const runelightHostPortPlaceholder = "{port}"
const defaultRunelightRoutes = {
  changes: "/runelight/studio/changes",
  events: "/runelight/studio/events",
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".runelight"])
const previewEntriesPluginName = "RunelightNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("runelight.next.preview-entry.watchers")
const globalStudioEventsServerSymbol = Symbol.for("runelight.next.studio.events.servers")
const previewImportQuery = "runelight-preview"
const runelightDevEnvName = "RUNELIGHT_DEV"
const runelightServerExternalPackages = ["@runelight/core", "@runelight/studio"]

function runelightNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const runelightDevEnabled = isRunelightNextRouteEnabled(root, options)

  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("@runelight/react/contract", {
    paths: [root, process.cwd()],
  })
  const previewEntries = runelightDevEnabled ? resolvePreviewEntriesOptions(root, options) : undefined

  return function withRunelightNextReact(nextConfig = {}) {
    const userWebpack = nextConfig.webpack
    const studioEventsServer = startRunelightNextStudioEventsServer(root, previewEntries, options.config)
    writeRunelightNextPreviewEntries(root, previewEntries)
    startRunelightNextPreviewEntriesWatcher(root, previewEntries)

    return {
      ...nextConfig,
      webpack(config, context) {
        writeRunelightNextPreviewEntries(root, previewEntries)
        const resolvedConfig = typeof userWebpack === "function" ? userWebpack(config, context) : config
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
    }
  }
}

function withRunelightServerExternalPackages(serverExternalPackages) {
  const merged = [...(serverExternalPackages ?? [])]
  for (const packageName of runelightServerExternalPackages) {
    if (!merged.includes(packageName)) merged.push(packageName)
  }
  return merged
}

function isRunelightNextRouteEnabled(root, options) {
  if (process.env[runelightDevEnvName] === "1") return true

  return resolveOptionalNextRunelightConfig(root, options.config)?.studio.exposeInProduction === true
}

function withRunelightTurbopackConfig(turbopack, loaderPath, root, transformPath, previewEntries) {
  const runelightRule = {
    loaders: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath, transpilePreview: true } }],
  }
  const rules = turbopack?.rules ?? {}

  return {
    ...turbopack,
    resolveAlias: {
      ...(turbopack?.resolveAlias ?? {}),
      ...(previewEntries ? { [defaultPreviewEntriesModuleId]: toTurbopackResolveAliasPath(root, previewEntries.outputPath) } : {}),
    },
    rules: {
      ...rules,
      "*.g.tsx": prependRule(runelightRule, rules["*.g.tsx"]),
    },
  }
}

function prependRule(rule, existing) {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

function resolvePreviewEntriesOptions(root, options) {
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

function resolveNextRunelightConfig(root, config) {
  if (config) return resolveRunelightConfig(config)

  const loaded = loadRunelightConfig(root)
  if (loaded.config) return resolveRunelightConfig(loaded.config)

  const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
  throw new Error(message || "Missing runelight.config.ts for Next adapter.")
}

function resolveOptionalNextRunelightConfig(root, config) {
  if (config) return resolveRunelightConfig(config)

  const loaded = loadRunelightConfig(root)
  if (!loaded.config) return undefined

  return resolveRunelightConfig(loaded.config)
}

function loadRunelightConfig(cwd) {
  const configPath = ["runelight.config.ts", "runelight.config.js", "runelight.config.cjs"]
    .map((fileName) => join(cwd, fileName))
    .find((candidate) => existsSync(candidate))

  if (!configPath) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "missing-config",
          message: "Missing runelight.config.ts for adapter commands.",
        },
      ],
    }
  }

  try {
    const config = configPath.endsWith(".ts") ? loadTypeScriptConfig(configPath) : loadCommonJSConfig(configPath)
    const diagnostics = validateLoadedRunelightConfig(config)
    if (diagnostics.length > 0) return { diagnostics }

    return { config, diagnostics: [] }
  } catch (error) {
    return {
      diagnostics: [
        {
          stage: "adapter-configuration",
          code: "invalid-config",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}

function loadTypeScriptConfig(configPath) {
  const ts = require(require.resolve("typescript", { paths: [dirname(configPath), process.cwd(), __dirname] }))
  const source = readFileSync(configPath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: configPath,
  }).outputText
  const moduleValue = { exports: {} }
  vm.runInNewContext(compiled, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: requireRunelightConfigDependency,
  })
  return readDefaultExport(moduleValue.exports)
}

function loadCommonJSConfig(configPath) {
  const moduleValue = { exports: {} }
  const source = readFileSync(configPath, "utf8")
  vm.runInNewContext(source, {
    exports: moduleValue.exports,
    module: moduleValue,
    require: requireRunelightConfigDependency,
  })
  return readDefaultExport(moduleValue.exports)
}

function requireRunelightConfigDependency(specifier) {
  if (specifier === "@runelight/core") return { defineRunelightConfig }
  throw new Error(`Unsupported config import: ${specifier}`)
}

function defineRunelightConfig(config) {
  return config
}

function readDefaultExport(exportsValue) {
  return exportsValue.default ?? exportsValue
}

function resolveRunelightConfig(config) {
  assertRunelightConfig(config)

  return {
    host: config.host ?? {},
    project: {
      entryRoot: normalizeRunelightPath(config.project.entryRoot),
      sourceRoot: normalizeRunelightPath(config.project.sourceRoot),
      ...(config.project?.namespace ? { namespace: config.project.namespace } : {}),
      ...(config.project?.tsconfig ? { tsconfig: config.project.tsconfig } : {}),
    },
    routes: defaultRunelightRoutes,
    studio: {
      exposeInProduction: config.studio?.exposeInProduction ?? false,
    },
  }
}

function validateLoadedRunelightConfig(config) {
  const diagnostics = []
  if (!Array.isArray(config?.contracts) || config.contracts.length === 0) {
    diagnostics.push({
      stage: "adapter-configuration",
      code: "missing-contracts",
      message: 'Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].',
    })
  } else if (!config.contracts.every(isNonEmptyString)) {
    diagnostics.push({
      stage: "adapter-configuration",
      code: "invalid-contracts",
      message: 'contracts in runelight.config.ts must be string specifiers, for example contracts: ["@runelight/react/contract"].',
    })
  }
  if (!config?.project || !isNonEmptyString(config.project.entryRoot)) {
    diagnostics.push({
      stage: "adapter-configuration",
      code: "missing-entry-root",
      message: 'Add project.entryRoot to runelight.config.ts, for example project: { entryRoot: "src/app/runelight" } for src-based projects.',
    })
  }
  if (!config?.project || !isNonEmptyString(config.project.sourceRoot)) {
    diagnostics.push({
      stage: "adapter-configuration",
      code: "missing-source-root",
      message: 'Add project.sourceRoot to runelight.config.ts, for example project: { sourceRoot: "src" } or project: { sourceRoot: "." }.',
    })
  }
  if (config?.host?.command !== undefined && !isRunelightHostCommandWithPortPlaceholder(config.host.command)) {
    diagnostics.push({
      stage: "adapter-configuration",
      code: "invalid-host-command",
      message: "host.command in runelight.config.ts must include the {port} placeholder so Runelight can choose and substitute the Host port.",
    })
  }
  return diagnostics
}

function assertRunelightConfig(config) {
  const diagnostics = validateLoadedRunelightConfig(config)
  if (diagnostics.length > 0) throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("\n"))
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function isRunelightHostCommandWithPortPlaceholder(command) {
  return isNonEmptyString(command) && command.includes(runelightHostPortPlaceholder)
}

function writeRunelightNextPreviewEntries(root, options) {
  if (!options || !existsSync(root)) return

  prepareRunelightNextBaselineSource(root, options)
  const files = discoverRunelightPreviewFiles(root, options)
  const code = createRunelightNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverRunelightPreviewFiles(root, options) {
  const files = new Set()

  for (const previewRoot of runelightNextPreviewEntryRoots(options)) {
    collectRunelightPreviewFiles(resolve(root, previewRoot), files, root)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectRunelightPreviewFiles(directory, files, root) {
  if (!existsSync(directory)) return

  walk(directory)

  function walk(currentDirectory) {
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

function runelightNextPreviewEntryRoots(options) {
  const designRoot = runelightDesignRootFromEntryRoot(options.entryRoot)
  return [...new Set([options.sourceRoot, designRoot, `${options.baselineRoot}/${options.sourceRoot}`, `${options.baselineRoot}/${designRoot}`])]
}

function runelightNextPreviewEntryWatchRoots(options) {
  return [...new Set([options.sourceRoot, options.entryRoot, runelightDesignRootFromEntryRoot(options.entryRoot)])]
}

class RunelightNextPreviewEntriesPlugin {
  constructor(root, options) {
    this.root = root
    this.options = options
  }

  apply(compiler) {
    compiler.hooks?.beforeRun?.tap(previewEntriesPluginName, () => writeRunelightNextPreviewEntries(this.root, this.options))
    compiler.hooks?.watchRun?.tap(previewEntriesPluginName, () => writeRunelightNextPreviewEntries(this.root, this.options))
    compiler.hooks?.afterCompile?.tap(previewEntriesPluginName, (compilation) => {
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

function installRunelightNextPreviewEntriesPlugin(config, root, options) {
  if (!options) return

  config.plugins ??= []
  if (config.plugins.some((plugin) => plugin instanceof RunelightNextPreviewEntriesPlugin)) return
  config.plugins.push(new RunelightNextPreviewEntriesPlugin(root, options))
}

function startRunelightNextPreviewEntriesWatcher(root, options) {
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

function globalPreviewEntryWatchers() {
  globalThis[globalPreviewEntryWatcherSymbol] ??= new Map()
  return globalThis[globalPreviewEntryWatcherSymbol]
}

function watchRunelightNextPreviewEntryRoots(root, options) {
  let pending
  const directoryWatchers = new Map()

  const scheduleWrite = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = undefined
      writeRunelightNextPreviewEntries(root, options)
      notifyRunelightNextStudioManifestChange(root, options)
    }, previewEntriesWatcherDebounceMs)
    pending.unref?.()
  }

  const watchDirectory = (directory) => {
    if (directoryWatchers.has(directory)) return

    let dirents
    try {
      dirents = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    let watcher
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

  const watchDirectoryTree = (directory, options = {}) => {
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

function withRunelightNextStudioEventsRewrites(userRewrites, studioEventsServer, options) {
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

function prependNextRewrites(rewrites, prepended) {
  return prepended.reduceRight((nextRewrites, rewrite) => prependNextRewrite(nextRewrites, rewrite), rewrites)
}

function prependNextRewrite(rewrites, rewrite) {
  if (!rewrites) return [rewrite]
  if (Array.isArray(rewrites)) return [rewrite, ...rewrites]
  if (typeof rewrites === "object") {
    return {
      ...rewrites,
      beforeFiles: [rewrite, ...(Array.isArray(rewrites.beforeFiles) ? rewrites.beforeFiles : [])],
    }
  }

  return [rewrite]
}

function startRunelightNextStudioEventsServer(root, options, config) {
  if (!options || !isRunelightDevMode()) return undefined

  const key = runelightNextPreviewEntriesKey(root, options)
  const servers = globalStudioEventsServers()
  const existing = servers.get(key)
  if (existing) return existing

  const hub = createRunelightStudioEventHub()
  let changesProviderPromise
  const getChangesProvider = () => {
    changesProviderPromise ??= createRunelightNextStudioChangesProvider({ config, root })
    return changesProviderPromise
  }
  const server = createServer((request, response) => {
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
  const url = new Promise((resolveUrl, rejectUrl) => {
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

async function serveRunelightNextStudioChanges(response, options) {
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

async function createRunelightNextStudioChangesProvider(options) {
  const { createStudioWorkspaceChangesProvider } = await import("@runelight/studio/manifest-server")
  return createStudioWorkspaceChangesProvider({ config: options.config, cwd: options.root })
}

function globalStudioEventsServers() {
  globalThis[globalStudioEventsServerSymbol] ??= new Map()
  return globalThis[globalStudioEventsServerSymbol]
}

function notifyRunelightNextStudioManifestChange(root, options) {
  globalStudioEventsServers().get(runelightNextPreviewEntriesKey(root, options))?.publish()
}

function createRunelightStudioEventHub() {
  const clients = new Set()

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

function serveRunelightNextStudioEvents(request, response, studioEvents) {
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

function runelightNextPreviewEntriesKey(root, options) {
  return JSON.stringify({
    baselineRoot: options.baselineRoot,
    entryRoot: options.entryRoot,
    outputPath: options.outputPath,
    sourceRoot: options.sourceRoot,
    root,
  })
}

function runelightNextStudioEventsRoute() {
  return "/runelight/studio/events"
}

function runelightNextStudioChangesRoute() {
  return "/runelight/studio/changes"
}

function requestPathname(url) {
  return new URL(url ?? "/", "http://runelight.local").pathname
}

function isRunelightDevMode() {
  return process.env[runelightDevEnvName] === "1"
}

function createRunelightNextPreviewEntriesModule(root, outputPath, files) {
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

function toGeneratedImportSpecifier(outputPath, absoluteFilePath, previewQuery) {
  const extensionless = absoluteFilePath.replace(/\.tsx$/, "")
  const relativePath = relative(dirname(outputPath), extensionless).split(sep).join("/")
  const specifier = relativePath.startsWith(".") ? relativePath : `./${relativePath}`
  return `${specifier}?${previewQuery}`
}

function toTurbopackResolveAliasPath(root, outputPath) {
  const relativePath = relative(root, outputPath).split(sep).join("/")
  return relativePath.startsWith("./") || relativePath.startsWith("../") ? relativePath : `./${relativePath}`
}

function readFileIfExists(path) {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function statOrUndefined(path) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}

function ensureRunelightDesignDirectory(root, options) {
  mkdirSync(resolve(root, runelightDesignRootFromEntryRoot(options.entryRoot)), { recursive: true })
}

function prepareRunelightNextBaselineSource(root, options) {
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

function runelightNextBaselineSourceCacheKey(root, options) {
  return JSON.stringify({
    baselineRoot: options.baselineRoot,
    entryRoot: options.entryRoot,
    head: readRunelightNextGitHeadRevision(root),
    runtimeImportSpecifier: "@runelight/react/runtime",
    sourceRoot: options.sourceRoot,
  })
}

function readRunelightNextGitHeadRevision(root) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return undefined
  }
}

function readRunelightNextGitHeadFiles(root, pathspecs) {
  let output
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

function readRunelightNextGitHeadFile(root, path) {
  try {
    return execFileSync("git", ["-C", root, "show", `HEAD:${path}`], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return undefined
  }
}

function shouldRewriteRunelightNextBaselineImports(path) {
  return /\.(c|m)?(t|j)sx?$/.test(path)
}

function rewriteRunelightNextBaselineImports(source, options) {
  const aliasRewritten = source
    .replaceAll(/(from\s*["'])@\/([^"']+)(["'])/g, (_match, before, target, after) =>
      `${before}${runelightNextBaselineRelativeAliasSpecifier(options, target)}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@\/([^"']+)(["']\s*\))/g, (_match, before, target, after) =>
      `${before}${runelightNextBaselineRelativeAliasSpecifier(options, target)}${after}`)
  if (!options.runtimeImportSpecifier || !isRunelightNextBaselineProtocolFile(options.filePath)) return aliasRewritten

  return aliasRewritten
    .replaceAll(/(from\s*["'])@runelight\/core(["'])/g, (_match, before, after) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
    .replaceAll(/(import\s*\(\s*["'])@runelight\/core(["']\s*\))/g, (_match, before, after) =>
      `${before}${options.runtimeImportSpecifier}${after}`)
}

function runelightNextBaselineRelativeAliasSpecifier(options, target) {
  const fromDirectory = dirname(`${options.baselineRoot}/${options.filePath}`)
  const toPath = `${options.baselineRoot}/${options.sourceRoot}/${target}`.replaceAll("\\", "/")
  const relativePath = relative(fromDirectory, toPath).split(sep).join("/")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

function isRunelightNextBaselineProtocolFile(path) {
  return path.endsWith(".g.tsx")
}

function runelightDesignRootFromEntryRoot(entryRoot) {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

function runelightGeneratedRootFromEntryRoot(entryRoot) {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? ".runelight" : `${root}/.runelight`
}

function runelightBaselineRootFromEntryRoot(entryRoot) {
  return `${runelightGeneratedRootFromEntryRoot(entryRoot)}/baselines/HEAD`
}

function normalizeRunelightPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}

module.exports = {
  runelightNextReact,
}
