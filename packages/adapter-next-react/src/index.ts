import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type Dirent, type FSWatcher } from "node:fs"
import { createRequire } from "node:module"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import { runelightDesignRootFromEntryRoot, normalizeRunelightPath } from "@runelight/core/config-model"
import type { RunelightConfig } from "@runelight/core"

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

type RunelightNextReactOptions = {
  config?: RunelightConfig
  enabled?: boolean
  previewEntries?: false | RunelightNextPreviewEntriesOptions
  sourceRoot?: string
  root?: string
}

type RunelightNextPreviewEntriesOptions = {
  entryRoot?: string
  moduleId?: string
  outputFile?: string
  sourceRoot?: string
}

type ResolvedRunelightNextPreviewEntriesOptions = {
  entryRoot: string
  moduleId: string
  outputPath: string
  sourceRoot: string
}

const defaultPreviewEntriesModuleId = "@runelight/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".runelight/preview-entries.ts"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".runelight"])
const previewEntriesPluginName = "RunelightNextPreviewEntriesPlugin"
const previewEntriesWatcherDebounceMs = 50
const globalPreviewEntryWatcherSymbol = Symbol.for("runelight.next.preview-entry.watchers")
const previewImportQuery = "runelight-preview"
const runelightDevEnvName = "RUNELIGHT_DEV"

type GlobalPreviewEntryWatcher = typeof globalThis & {
  [globalPreviewEntryWatcherSymbol]?: Map<string, { close(): void }>
}

export function runelightNextReact(
  options: RunelightNextReactOptions = {},
): <Config extends NextConfigLike>(nextConfig?: Config) => Config & NextConfigLike {
  const root = options.root ?? process.cwd()
  const runelightDevEnabled = options.enabled ?? isRunelightDevMode()

  const loaderPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loader.cjs")
  const transformPath = resolveRunelightReactTransform(root)
  const previewEntries = runelightDevEnabled ? resolvePreviewEntriesOptions(root, options) : undefined

  return function withRunelightNextReact<Config extends NextConfigLike>(nextConfig: Config = {} as Config): Config & NextConfigLike {
    const userWebpack = nextConfig.webpack
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
    } as Config & NextConfigLike
  }
}

function isRunelightDevMode(): boolean {
  return process.env[runelightDevEnvName] === "1"
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

function prependRule(
  rule: TurbopackRuleConfigItem,
  existing: TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> | undefined,
): TurbopackRuleConfigItem | Array<TurbopackRuleConfigItem | string> {
  if (!existing) return rule
  return Array.isArray(existing) ? [rule, ...existing] : [rule, existing]
}

function resolveRunelightReactTransform(root: string): string {
  return createRequire(import.meta.url).resolve("@runelight/core/react-transform", {
    paths: [root, process.cwd()],
  })
}

function resolvePreviewEntriesOptions(
  root: string,
  options: RunelightNextReactOptions,
): ResolvedRunelightNextPreviewEntriesOptions | undefined {
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
    sourceRoot: previewEntries.sourceRoot ?? options.sourceRoot ?? resolvedConfig?.project.sourceRoot ?? "src",
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
  return [...new Set([options.sourceRoot, runelightDesignRootFromEntryRoot(options.entryRoot)])]
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

  const key = JSON.stringify({ entryRoot: options.entryRoot, outputPath: options.outputPath, sourceRoot: options.sourceRoot, root })
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

function createRunelightNextPreviewEntriesModule(root: string, outputPath: string, files: string[]): string {
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
