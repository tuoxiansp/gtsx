"use strict"

const { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, writeFileSync } = require("node:fs")
const { dirname, join, relative, resolve, sep } = require("node:path")
const vm = require("node:vm")

const defaultPreviewEntriesModuleId = "@runelight/adapter-next-react/preview-entries"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".runelight"])
const previewEntriesPluginName = "RunelightNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("runelight.next.preview-entry.watchers")
const previewImportQuery = "runelight-preview"
const runelightDevEnvName = "RUNELIGHT_DEV"
const runelightServerExternalPackages = ["@runelight/core"]
const runelightNextAdapterSubpathFiles = {
  "@runelight/adapter-next-react/preview": "preview",
  "@runelight/adapter-next-react/preview-route": "preview-route",
  "@runelight/adapter-next-react/session-route": "session-route",
}

function runelightNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const runelightDevEnabled = isRunelightNextRouteEnabled()

  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("@runelight/react/contract", {
    paths: [root, process.cwd()],
  })
  const previewEntries = runelightDevEnabled ? resolvePreviewEntriesOptions(root, options) : undefined

  return function withRunelightNextReact(nextConfig = {}) {
    const userWebpack = nextConfig.webpack
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

function isRunelightNextRouteEnabled() {
  return process.env[runelightDevEnvName] === "1"
}

function withRunelightServerExternalPackages(serverExternalPackages) {
  const merged = [...(serverExternalPackages ?? [])]
  for (const packageName of runelightServerExternalPackages) {
    if (!merged.includes(packageName)) merged.push(packageName)
  }
  return merged
}

function withRunelightTurbopackConfig(turbopack, loaderPath, root, transformPath, previewEntries) {
  const runelightRule = {
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

function runelightNextAdapterTurbopackResolveAliases(root) {
  return Object.fromEntries(
    Object.entries(runelightNextAdapterSubpathFiles).map(([moduleId, fileName]) => [
      moduleId,
      toTurbopackResolveAliasPath(root, resolve(root, `node_modules/@runelight/adapter-next-react/dist/${fileName}.js`)),
    ]),
  )
}

function runelightNextTurbopackRootOption(root) {
  const projectRoot = realpathIfExists(root) ?? resolve(root)
  const adapterFile = realpathIfExists(resolve(root, "node_modules/@runelight/adapter-next-react/dist/preview.js"))
  if (!adapterFile || isPathInsideDirectory(adapterFile, projectRoot)) return {}

  return { root: commonPathAncestor(projectRoot, adapterFile) }
}

function realpathIfExists(path) {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

function isPathInsideDirectory(path, directory) {
  const normalizedPath = resolve(path)
  const normalizedDirectory = resolve(directory)
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}${sep}`)
}

function commonPathAncestor(left, right) {
  const leftParts = resolve(left).split(sep)
  const rightParts = resolve(right).split(sep)
  const common = []
  const length = Math.min(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    if (leftParts[index] !== rightParts[index]) break
    common.push(leftParts[index])
  }

  if (common.length === 0) return resolve(sep)
  if (common.length === 1 && common[0] === "") return sep
  return common.join(sep) || sep
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
    routes: {
      preview: "/runelight",
      session: "/runelight/session",
    },
  }
}

function validateLoadedRunelightConfig(config) {
  try {
    resolveRunelightConfig(config)
    return []
  } catch (error) {
    return [
      {
        stage: "adapter-configuration",
        code: "invalid-config",
        message: error instanceof Error ? error.message : String(error),
      },
    ]
  }
}

function assertRunelightConfig(config) {
  const messages = []
  const candidate = config ?? {}

  if (!Array.isArray(candidate.contracts) || candidate.contracts.length === 0) {
    messages.push('Missing contracts in runelight.config.ts. Add a framework contract, for example contracts: ["@runelight/react/contract"].')
  } else if (!candidate.contracts.every(isNonEmptyString)) {
    messages.push('Invalid contracts in runelight.config.ts. Use string specifiers, for example contracts: ["@runelight/react/contract"].')
  }
  if (!candidate.project || !isNonEmptyString(candidate.project.entryRoot)) {
    messages.push('Missing project.entryRoot in runelight.config.ts. Record the local /runelight entry directory, for example project: { entryRoot: "src/app/runelight" } for src-based projects.')
  }
  if (!candidate.project || !isNonEmptyString(candidate.project.sourceRoot)) {
    messages.push('Missing project.sourceRoot in runelight.config.ts. Record the source directory to scan, for example project: { sourceRoot: "src" } or project: { sourceRoot: "." }.')
  }
  if (candidate.host?.command !== undefined && !isRunelightHostCommandWithPortPlaceholder(candidate.host.command)) {
    messages.push('Invalid host.command in runelight.config.ts. Include the {port} placeholder so Runelight can choose and substitute the Host port.')
  }

  if (messages.length > 0) throw new Error(messages.join("\n"))
}

function isRunelightHostCommandWithPortPlaceholder(command) {
  return isNonEmptyString(command) && command.includes("{port}")
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function normalizeRunelightPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}

function runelightGeneratedRootFromEntryRoot(entryRoot) {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? ".runelight" : `${root}/.runelight`
}

function writeRunelightNextPreviewEntries(root, options) {
  if (!options || !existsSync(root)) return

  const files = discoverRunelightPreviewFiles(root, options)
  const code = createRunelightNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverRunelightPreviewFiles(root, options) {
  const files = new Set()
  collectRunelightPreviewFiles(resolve(root, options.sourceRoot), files, root)

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

function runelightNextPreviewEntryWatchRoots(options) {
  return [...new Set([options.sourceRoot, options.entryRoot])]
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
    entryRoot: options.entryRoot,
    outputPath: options.outputPath,
    sourceRoot: options.sourceRoot,
    root,
  })
  const watchers = globalPreviewEntryWatchers()
  if (watchers.has(key)) return

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

module.exports = {
  runelightNextReact,
}
