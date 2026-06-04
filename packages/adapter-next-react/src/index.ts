import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type Dirent, type FSWatcher } from "node:fs"
import { createRequire } from "node:module"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { loadGTSXConfig, resolveGTSXConfig } from "@gtsx/core/config"
import { gtsxDesignRootFromEntryRoot, normalizeGTSXPath } from "@gtsx/core/config-model"
import type { GTSXConfig } from "@gtsx/core"

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
  webpack?: NextWebpackConfig | null
  turbopack?: any
  [key: string]: any
}

type GTSXNextReactOptions = {
  config?: GTSXConfig
  enabled?: boolean
  previewEntries?: false | GTSXNextPreviewEntriesOptions
  sourceRoot?: string
  root?: string
}

type GTSXNextPreviewEntriesOptions = {
  entryRoot?: string
  moduleId?: string
  outputFile?: string
  sourceRoot?: string
}

type ResolvedGTSXNextPreviewEntriesOptions = {
  entryRoot: string
  moduleId: string
  outputPath: string
  sourceRoot: string
}

const defaultPreviewEntriesModuleId = "@gtsx/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".gtsx/preview-entries.ts"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".gtsx"])
const previewEntriesPluginName = "GTSXNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("gtsx.next.preview-entry.watchers")
const previewImportQuery = "gtsx-preview"

type GlobalPreviewEntryWatcher = typeof globalThis & {
  [globalPreviewEntryWatcherSymbol]?: Map<string, { close(): void }>
}

export function gtsxNextReact(
  options: GTSXNextReactOptions = {},
): <Config extends NextConfigLike>(nextConfig?: Config) => Config & NextConfigLike {
  const root = options.root ?? process.cwd()
  const previewEntriesEnabled = options.enabled ?? process.env.NODE_ENV !== "production"

  if (!previewEntriesEnabled) {
    return function withGTSXNextReactPreviewEntriesDisabled<Config extends NextConfigLike>(
      nextConfig: Config = {} as Config,
    ): Config & NextConfigLike {
      return nextConfig as Config & NextConfigLike
    }
  }

  const loaderPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loader.cjs")
  const transformPath = resolveGTSXReactTransform(root)
  const previewEntries = resolvePreviewEntriesOptions(root, options)

  return function withGTSXNextReact<Config extends NextConfigLike>(nextConfig: Config = {} as Config): Config & NextConfigLike {
    const userWebpack = nextConfig.webpack
    writeGTSXNextPreviewEntries(root, previewEntries)
    startGTSXNextPreviewEntriesWatcher(root, previewEntries)

    return {
      ...nextConfig,
      webpack(config: WebpackConfig, context: any) {
        writeGTSXNextPreviewEntries(root, previewEntries)
        const resolvedConfig = (typeof userWebpack === "function" ? userWebpack(config, context) : config) as WebpackConfig
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
    } as Config & NextConfigLike
  }
}

function withGTSXTurbopackConfig(
  turbopack: NextConfigLike["turbopack"],
  loaderPath: string,
  root: string,
  transformPath: string,
  previewEntries: ResolvedGTSXNextPreviewEntriesOptions | undefined,
): NonNullable<NextConfigLike["turbopack"]> {
  const gtsxRule: TurbopackRuleConfigItem = {
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

function prependRule(
  rule: TurbopackRuleConfigItem,
  existing: TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> | undefined,
): TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

function resolveGTSXReactTransform(root: string): string {
  return createRequire(import.meta.url).resolve("@gtsx/core/react-transform", {
    paths: [root, process.cwd()],
  })
}

function resolvePreviewEntriesOptions(
  root: string,
  options: GTSXNextReactOptions,
): ResolvedGTSXNextPreviewEntriesOptions | undefined {
  if (options.previewEntries === false) return undefined

  const previewEntries = typeof options.previewEntries === "object" ? options.previewEntries : {}
  const resolvedConfig = resolveNextGTSXConfig(root, options.config)
  const entryRoot = previewEntries.entryRoot ?? resolvedConfig?.project.entryRoot
  if (!entryRoot) {
    throw new Error(
      "Missing project.entryRoot in gtsx.config.ts. Run setup-gtsx again so the local /gtsx entry directory is recorded.",
    )
  }

  return {
    entryRoot: normalizeGTSXPath(entryRoot),
    moduleId: previewEntries.moduleId ?? defaultPreviewEntriesModuleId,
    outputPath: resolve(root, previewEntries.outputFile ?? defaultPreviewEntriesOutputFile),
    sourceRoot: previewEntries.sourceRoot ?? options.sourceRoot ?? resolvedConfig?.project.sourceRoot ?? "src",
  }
}

function resolveNextGTSXConfig(root: string, config: GTSXConfig | undefined) {
  if (config) return resolveGTSXConfig(config)

  const loaded = loadGTSXConfig(root)
  if (loaded.config) return resolveGTSXConfig(loaded.config)

  const message = loaded.diagnostics.map((diagnostic) => diagnostic.message).filter(Boolean).join("\n")
  throw new Error(message || "Missing gtsx.config.ts for Next adapter.")
}

function writeGTSXNextPreviewEntries(root: string, options: ResolvedGTSXNextPreviewEntriesOptions | undefined) {
  if (!options || !existsSync(root)) return

  const files = discoverGTSXPreviewFiles(root, options)
  const code = createGTSXNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverGTSXPreviewFiles(root: string, options: ResolvedGTSXNextPreviewEntriesOptions): string[] {
  const files = new Set<string>()

  for (const previewRoot of gtsxNextPreviewEntryRoots(options)) {
    collectGTSXPreviewFiles(resolve(root, previewRoot), files, root)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectGTSXPreviewFiles(directory: string, files: Set<string>, root: string) {
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

function gtsxNextPreviewEntryRoots(options: ResolvedGTSXNextPreviewEntriesOptions): string[] {
  return [...new Set([options.sourceRoot, gtsxDesignRootFromEntryRoot(options.entryRoot)])]
}

function gtsxNextPreviewEntryWatchRoots(options: ResolvedGTSXNextPreviewEntriesOptions): string[] {
  return [...new Set([options.sourceRoot, options.entryRoot, gtsxDesignRootFromEntryRoot(options.entryRoot)])]
}

class GTSXNextPreviewEntriesPlugin {
  constructor(
    private readonly root: string,
    private readonly options: ResolvedGTSXNextPreviewEntriesOptions | undefined,
  ) {}

  apply(compiler: {
    hooks?: {
      afterCompile?: { tap(name: string, handler: (compilation: any) => void): void }
      beforeRun?: { tap(name: string, handler: () => void): void }
      watchRun?: { tap(name: string, handler: () => void): void }
    }
  }) {
    compiler.hooks?.beforeRun?.tap(previewEntriesPluginName, () => writeGTSXNextPreviewEntries(this.root, this.options))
    compiler.hooks?.watchRun?.tap(previewEntriesPluginName, () => writeGTSXNextPreviewEntries(this.root, this.options))
    compiler.hooks?.afterCompile?.tap(previewEntriesPluginName, (compilation: any) => {
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

function installGTSXNextPreviewEntriesPlugin(
  config: WebpackConfig,
  root: string,
  options: ResolvedGTSXNextPreviewEntriesOptions | undefined,
) {
  if (!options) return

  config.plugins ??= []
  if (config.plugins.some((plugin) => plugin instanceof GTSXNextPreviewEntriesPlugin)) return
  config.plugins.push(new GTSXNextPreviewEntriesPlugin(root, options))
}

function startGTSXNextPreviewEntriesWatcher(root: string, options: ResolvedGTSXNextPreviewEntriesOptions | undefined) {
  if (!options || process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return

  const key = JSON.stringify({ entryRoot: options.entryRoot, outputPath: options.outputPath, sourceRoot: options.sourceRoot, root })
  const watchers = globalPreviewEntryWatchers()
  if (watchers.has(key)) return

  ensureGTSXDesignDirectory(root, options)
  writeGTSXNextPreviewEntries(root, options)
  const watcher = watchGTSXNextPreviewEntryRoots(root, options)
  watchers.set(key, watcher)
}

function globalPreviewEntryWatchers(): Map<string, { close(): void }> {
  const globalWatchers = globalThis as GlobalPreviewEntryWatcher
  globalWatchers[globalPreviewEntryWatcherSymbol] ??= new Map()
  return globalWatchers[globalPreviewEntryWatcherSymbol]
}

function watchGTSXNextPreviewEntryRoots(root: string, options: ResolvedGTSXNextPreviewEntriesOptions): { close(): void } {
  let pending: ReturnType<typeof setTimeout> | undefined
  const directoryWatchers = new Map<string, FSWatcher>()

  const scheduleWrite = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = undefined
      writeGTSXNextPreviewEntries(root, options)
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

function createGTSXNextPreviewEntriesModule(root: string, outputPath: string, files: string[]): string {
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

function ensureGTSXDesignDirectory(root: string, options: ResolvedGTSXNextPreviewEntriesOptions) {
  mkdirSync(resolve(root, gtsxDesignRootFromEntryRoot(options.entryRoot)), { recursive: true })
}
