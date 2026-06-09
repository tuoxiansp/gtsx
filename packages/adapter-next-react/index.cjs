"use strict"

const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } = require("node:fs")
const { dirname, join, relative, resolve, sep } = require("node:path")
const vm = require("node:vm")

const defaultPreviewEntriesModuleId = "@runelight/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".runelight/preview-entries.ts"
const defaultRunelightSourceRoot = "src"
const defaultRunelightRoutes = {
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}
const defaultStudioManifestCacheTtlMs = 1000
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".runelight"])
const previewEntriesPluginName = "RunelightNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("runelight.next.preview-entry.watchers")
const previewImportQuery = "runelight-preview"
const runelightDevEnvName = "RUNELIGHT_DEV"

function runelightNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const runelightDevEnabled = options.enabled ?? process.env[runelightDevEnvName] === "1"

  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("@runelight/core/react-transform", {
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
          ...(previewEntries ? { [previewEntries.moduleId]: previewEntries.outputPath } : {}),
        }
        installRunelightNextPreviewEntriesPlugin(resolvedConfig, root, previewEntries)
        resolvedConfig.module.rules.unshift({
          test: /\.g\.tsx$/,
          enforce: "pre",
          use: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath } }],
        })
        return resolvedConfig
      },
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

function withRunelightTurbopackConfig(turbopack, loaderPath, root, transformPath, previewEntries) {
  const runelightRule = {
    loaders: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath, transpilePreview: true } }],
  }
  const rules = turbopack?.rules ?? {}

  return {
    ...turbopack,
    resolveAlias: {
      ...(turbopack?.resolveAlias ?? {}),
      ...(previewEntries ? { [previewEntries.moduleId]: toTurbopackResolveAliasPath(root, previewEntries.outputPath) } : {}),
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

  const previewEntries = typeof options.previewEntries === "object" ? options.previewEntries : {}
  const resolvedConfig = resolveNextRunelightConfig(root, options.config)
  const entryRoot = previewEntries.entryRoot ?? resolvedConfig?.project.entryRoot
  if (!entryRoot) {
    throw new Error(
      "Missing project.entryRoot in runelight.config.ts. Run setup-runelight again so the local /runelight entry directory is recorded.",
    )
  }

  return {
    entryRoot: normalizeRunelightPath(entryRoot),
    moduleId: previewEntries.moduleId ?? defaultPreviewEntriesModuleId,
    outputPath: resolve(root, previewEntries.outputFile ?? defaultPreviewEntriesOutputFile),
    sourceRoot: previewEntries.sourceRoot ?? options.sourceRoot ?? resolvedConfig?.project.sourceRoot ?? defaultRunelightSourceRoot,
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
  const config = exportsValue.default ?? exportsValue
  if (!config.host) {
    throw new Error("Missing host configuration in runelight.config.ts.")
  }
  return config
}

function resolveRunelightConfig(config) {
  return {
    host: config.host ?? {},
    project: {
      sourceRoot: config.project?.sourceRoot ?? defaultRunelightSourceRoot,
      ...(config.project?.entryRoot ? { entryRoot: normalizeRunelightPath(config.project.entryRoot) } : {}),
      ...(config.project?.namespace ? { namespace: config.project.namespace } : {}),
      ...(config.project?.tsconfig ? { tsconfig: config.project.tsconfig } : {}),
    },
    routes: defaultRunelightRoutes,
    studio: {
      manifestCacheTtlMs: config.studio?.manifestCacheTtlMs ?? defaultStudioManifestCacheTtlMs,
    },
  }
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
  return [...new Set([options.sourceRoot, runelightDesignRootFromEntryRoot(options.entryRoot)])]
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

  const key = JSON.stringify({ entryRoot: options.entryRoot, outputPath: options.outputPath, sourceRoot: options.sourceRoot, root })
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

  return `import type { RunelightPreviewComponent } from "@runelight/adapter-next-react/preview"

export type RunelightPreviewModule = Record<string, unknown>
export type RunelightPreviewEntryLoader = () => Promise<RunelightPreviewModule>
export type RunelightPreviewEntryLoaders = Record<string, RunelightPreviewEntryLoader>

export const runelightPreviewEntryLoaders = {
${entries.join("\n")}
} satisfies RunelightPreviewEntryLoaders

export async function loadRunelightPreviewComponent(entry: string): Promise<RunelightPreviewComponent | undefined> {
  const { file, exportName } = parseRunelightPreviewEntry(entry)
  const loader = (runelightPreviewEntryLoaders as RunelightPreviewEntryLoaders)[file]
  if (!loader) return undefined

  const moduleValue = await loader()
  const component = moduleValue[exportName]
  return typeof component === "function" ? (component as RunelightPreviewComponent) : undefined
}

export function parseRunelightPreviewEntry(entry: string): { file: string; exportName: string } {
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

function runelightDesignRootFromEntryRoot(entryRoot) {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

function normalizeRunelightPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}

module.exports = {
  runelightNextReact,
}
