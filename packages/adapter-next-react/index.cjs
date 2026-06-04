"use strict"

const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync } = require("node:fs")
const { dirname, relative, resolve, sep } = require("node:path")

const defaultPreviewEntriesModuleId = "@gtsx/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".gtsx/preview-entries.ts"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".gtsx"])
const previewEntriesPluginName = "GTSXNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("gtsx.next.preview-entry.watchers")
const previewImportQuery = "gtsx-preview"

function gtsxNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const previewEntriesEnabled = options.enabled ?? process.env.NODE_ENV !== "production"

  if (!previewEntriesEnabled) {
    return function withGTSXNextReactPreviewEntriesDisabled(nextConfig = {}) {
      return nextConfig
    }
  }

  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("@gtsx/core/react-transform", {
    paths: [root, process.cwd()],
  })
  const previewEntries = resolvePreviewEntriesOptions(root, options)

  return function withGTSXNextReact(nextConfig = {}) {
    const userWebpack = nextConfig.webpack
    writeGTSXNextPreviewEntries(root, previewEntries)
    startGTSXNextPreviewEntriesWatcher(root, previewEntries)

    return {
      ...nextConfig,
      webpack(config, context) {
        writeGTSXNextPreviewEntries(root, previewEntries)
        const resolvedConfig = typeof userWebpack === "function" ? userWebpack(config, context) : config
        resolvedConfig.module ??= {}
        resolvedConfig.module.rules ??= []
        resolvedConfig.resolve ??= {}
        resolvedConfig.resolve.alias = {
          ...(resolvedConfig.resolve.alias ?? {}),
          ...(previewEntries ? { [previewEntries.moduleId]: previewEntries.outputPath } : {}),
        }
        installGTSXNextPreviewEntriesPlugin(resolvedConfig, root, previewEntries)
        resolvedConfig.module.rules.unshift({
          test: /\.g\.tsx$/,
          enforce: "pre",
          use: [{ loader: loaderPath, options: { previewQuery: previewImportQuery, root, transformPath } }],
        })
        return resolvedConfig
      },
      turbopack: withGTSXTurbopackConfig(
        nextConfig.turbopack,
        loaderPath,
        root,
        transformPath,
        previewEntries,
      ),
    }
  }
}

function withGTSXTurbopackConfig(turbopack, loaderPath, root, transformPath, previewEntries) {
  const gtsxRule = {
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
      "*.g.tsx": prependRule(gtsxRule, rules["*.g.tsx"]),
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
  const configuredSourceRoot = options.config?.project?.sourceRoot
  const entryRoot = previewEntries.entryRoot ?? options.config?.project?.entryRoot
  if (!entryRoot) {
    throw new Error(
      "Missing project.entryRoot in gtsx.config.ts. Run setup-gtsx again so the local /gtsx entry directory is recorded.",
    )
  }

  return {
    entryRoot: normalizeGTSXPath(entryRoot),
    moduleId: previewEntries.moduleId ?? defaultPreviewEntriesModuleId,
    outputPath: resolve(root, previewEntries.outputFile ?? defaultPreviewEntriesOutputFile),
    sourceRoot: previewEntries.sourceRoot ?? options.sourceRoot ?? configuredSourceRoot ?? "src",
  }
}

function writeGTSXNextPreviewEntries(root, options) {
  if (!options || !existsSync(root)) return

  const files = discoverGTSXPreviewFiles(root, options)
  const code = createGTSXNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverGTSXPreviewFiles(root, options) {
  const files = new Set()

  for (const previewRoot of gtsxNextPreviewEntryRoots(options)) {
    collectGTSXPreviewFiles(resolve(root, previewRoot), files, root)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectGTSXPreviewFiles(directory, files, root) {
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

function gtsxNextPreviewEntryRoots(options) {
  return [...new Set([options.sourceRoot, gtsxDesignRootFromEntryRoot(options.entryRoot)])]
}

function gtsxNextPreviewEntryWatchRoots(options) {
  return [...new Set([options.sourceRoot, options.entryRoot, gtsxDesignRootFromEntryRoot(options.entryRoot)])]
}

class GTSXNextPreviewEntriesPlugin {
  constructor(root, options) {
    this.root = root
    this.options = options
  }

  apply(compiler) {
    compiler.hooks?.beforeRun?.tap(previewEntriesPluginName, () => writeGTSXNextPreviewEntries(this.root, this.options))
    compiler.hooks?.watchRun?.tap(previewEntriesPluginName, () => writeGTSXNextPreviewEntries(this.root, this.options))
    compiler.hooks?.afterCompile?.tap(previewEntriesPluginName, (compilation) => {
      if (!this.options) return

      for (const watchRoot of gtsxNextPreviewEntryWatchRoots(this.options)) {
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

function installGTSXNextPreviewEntriesPlugin(config, root, options) {
  if (!options) return

  config.plugins ??= []
  if (config.plugins.some((plugin) => plugin instanceof GTSXNextPreviewEntriesPlugin)) return
  config.plugins.push(new GTSXNextPreviewEntriesPlugin(root, options))
}

function startGTSXNextPreviewEntriesWatcher(root, options) {
  if (!options || process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return

  const key = JSON.stringify({ entryRoot: options.entryRoot, outputPath: options.outputPath, sourceRoot: options.sourceRoot, root })
  const watchers = globalPreviewEntryWatchers()
  if (watchers.has(key)) return

  ensureGTSXDesignDirectory(root, options)
  writeGTSXNextPreviewEntries(root, options)
  const watcher = watchGTSXNextPreviewEntryRoots(root, options)
  watchers.set(key, watcher)
}

function globalPreviewEntryWatchers() {
  globalThis[globalPreviewEntryWatcherSymbol] ??= new Map()
  return globalThis[globalPreviewEntryWatcherSymbol]
}

function watchGTSXNextPreviewEntryRoots(root, options) {
  let pending
  const directoryWatchers = new Map()

  const scheduleWrite = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = undefined
      writeGTSXNextPreviewEntries(root, options)
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

  for (const watchRoot of gtsxNextPreviewEntryWatchRoots(options)) {
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

function createGTSXNextPreviewEntriesModule(root, outputPath, files) {
  const entries = files.map((filePath) => {
    const absoluteFilePath = resolve(root, filePath)
    return `  ${JSON.stringify(filePath)}: () => import(${JSON.stringify(toGeneratedImportSpecifier(outputPath, absoluteFilePath, previewImportQuery))}),`
  })

  return `import type { GTSXPreviewComponent } from "@gtsx/adapter-next-react/preview"

export type GTSXPreviewModule = Record<string, unknown>
export type GTSXPreviewEntryLoader = () => Promise<GTSXPreviewModule>
export type GTSXPreviewEntryLoaders = Record<string, GTSXPreviewEntryLoader>

export const gtsxPreviewEntryLoaders = {
${entries.join("\n")}
} satisfies GTSXPreviewEntryLoaders

export async function loadGTSXPreviewComponent(entry: string): Promise<GTSXPreviewComponent | undefined> {
  const { file, exportName } = parseGTSXPreviewEntry(entry)
  const loader = (gtsxPreviewEntryLoaders as GTSXPreviewEntryLoaders)[file]
  if (!loader) return undefined

  const moduleValue = await loader()
  const component = moduleValue[exportName]
  return typeof component === "function" ? (component as GTSXPreviewComponent) : undefined
}

export function parseGTSXPreviewEntry(entry: string): { file: string; exportName: string } {
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

function ensureGTSXDesignDirectory(root, options) {
  mkdirSync(resolve(root, gtsxDesignRootFromEntryRoot(options.entryRoot)), { recursive: true })
}

function gtsxDesignRootFromEntryRoot(entryRoot) {
  const root = normalizeGTSXPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

function normalizeGTSXPath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}

module.exports = {
  gtsxNextReact,
}
