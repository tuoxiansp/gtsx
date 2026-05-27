import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveGTSXConfig } from "gtsx/config-model"
import type { GTSXConfig } from "gtsx"

type WebpackRule = {
  enforce?: string
  test?: RegExp
  use?: Array<{ loader: string; options?: Record<string, unknown> }>
}

type WebpackConfig = {
  module?: {
    rules?: WebpackRule[]
  }
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
  previewEntries?: false | GTSXNextPreviewEntriesOptions
  projectRoot?: string
  root?: string
}

type GTSXNextPreviewEntriesOptions = {
  moduleId?: string
  outputFile?: string
  projectRoot?: string
}

type ResolvedGTSXNextPreviewEntriesOptions = {
  moduleId: string
  outputPath: string
  projectRoot: string
}

const defaultPreviewEntriesModuleId = "@gtsx/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".gtsx/preview-entries.ts"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".gtsx"])

export function gtsxNextReact(options: GTSXNextReactOptions = {}) {
  const root = options.root ?? process.cwd()
  const loaderPath = resolve(dirname(fileURLToPath(import.meta.url)), "../loader.cjs")
  const transformPath = resolveGTSXReactTransform(root)
  const previewEntries = resolvePreviewEntriesOptions(root, options)

  return function withGTSXNextReact<Config extends NextConfigLike>(nextConfig: Config = {} as Config): Config & NextConfigLike {
    const userWebpack = nextConfig.webpack
    writeGTSXNextPreviewEntries(root, previewEntries)

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
        resolvedConfig.module.rules.unshift({
          test: /\.g\.tsx$/,
          enforce: "pre",
          use: [{ loader: loaderPath, options: { root, transformPath } }],
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
    loaders: [{ loader: loaderPath, options: { root, transformPath } }],
    as: "*.tsx",
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
  return createRequire(import.meta.url).resolve("gtsx/react-transform", {
    paths: [root, process.cwd()],
  })
}

function resolvePreviewEntriesOptions(
  root: string,
  options: GTSXNextReactOptions,
): ResolvedGTSXNextPreviewEntriesOptions | undefined {
  if (options.previewEntries === false) return undefined

  const previewEntries = typeof options.previewEntries === "object" ? options.previewEntries : {}
  const resolvedConfig = options.config ? resolveGTSXConfig(options.config) : undefined
  return {
    moduleId: previewEntries.moduleId ?? defaultPreviewEntriesModuleId,
    outputPath: resolve(root, previewEntries.outputFile ?? defaultPreviewEntriesOutputFile),
    projectRoot: previewEntries.projectRoot ?? options.projectRoot ?? resolvedConfig?.project.root ?? "src",
  }
}

function writeGTSXNextPreviewEntries(root: string, options: ResolvedGTSXNextPreviewEntriesOptions | undefined) {
  if (!options || !existsSync(root)) return

  const files = discoverGTSXPreviewFiles(root, options.projectRoot)
  const code = createGTSXNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverGTSXPreviewFiles(root: string, projectRoot: string): string[] {
  const directory = resolve(root, projectRoot)
  if (!existsSync(directory)) return []

  const files: string[] = []
  walk(directory)
  return files.map((filePath) => relative(root, filePath).split(sep).join("/")).sort((left, right) => left.localeCompare(right))

  function walk(currentDirectory: string) {
    for (const dirent of readdirSync(currentDirectory, { withFileTypes: true })) {
      if (dirent.isDirectory()) {
        if (!ignoredPreviewEntryDirs.has(dirent.name)) {
          walk(resolve(currentDirectory, dirent.name))
        }
        continue
      }

      if (dirent.isFile() && dirent.name.endsWith(".g.tsx")) {
        files.push(resolve(currentDirectory, dirent.name))
      }
    }
  }
}

function createGTSXNextPreviewEntriesModule(root: string, outputPath: string, files: string[]): string {
  const entries = files.map((filePath) => {
    const absoluteFilePath = resolve(root, filePath)
    return `  ${JSON.stringify(filePath)}: () => import(${JSON.stringify(toGeneratedImportSpecifier(outputPath, absoluteFilePath))}),`
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

function toGeneratedImportSpecifier(outputPath: string, absoluteFilePath: string): string {
  const extensionless = absoluteFilePath.replace(/\.tsx$/, "")
  const relativePath = relative(dirname(outputPath), extensionless).split(sep).join("/")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
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
