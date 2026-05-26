"use strict"

const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require("node:fs")
const { dirname, relative, resolve, sep } = require("node:path")

const defaultPreviewEntriesModuleId = "@gtsx/adapter-next-react/preview-entries"
const defaultPreviewEntriesOutputFile = ".gtsx/preview-entries.ts"
const ignoredPreviewEntryDirs = new Set(["node_modules", "dist", ".next", ".git", ".gtsx"])

function gtsxNextReact(options = {}) {
  const root = options.root ?? process.cwd()
  const loaderPath = resolve(__dirname, "loader.cjs")
  const transformPath = require.resolve("gtsx/react-transform", {
    paths: [root, process.cwd()],
  })
  const previewEntries = resolvePreviewEntriesOptions(root, options)

  return function withGTSXNextReact(nextConfig = {}) {
    const userWebpack = nextConfig.webpack
    writeGTSXNextPreviewEntries(root, previewEntries)

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
      ),
    }
  }
}

function withGTSXTurbopackConfig(turbopack, loaderPath, root, transformPath) {
  const gtsxRule = {
    loaders: [{ loader: loaderPath, options: { root, transformPath } }],
    as: "*.tsx",
  }
  const rules = turbopack?.rules ?? {}

  return {
    ...turbopack,
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
  return {
    moduleId: previewEntries.moduleId ?? defaultPreviewEntriesModuleId,
    outputPath: resolve(root, previewEntries.outputFile ?? defaultPreviewEntriesOutputFile),
    projectRoot: previewEntries.projectRoot ?? options.projectRoot ?? "src",
  }
}

function writeGTSXNextPreviewEntries(root, options) {
  if (!options || !existsSync(root)) return

  const files = discoverGTSXPreviewFiles(root, options.projectRoot)
  const code = createGTSXNextPreviewEntriesModule(root, options.outputPath, files)
  const current = readFileIfExists(options.outputPath)
  if (current === code) return

  mkdirSync(dirname(options.outputPath), { recursive: true })
  writeFileSync(options.outputPath, code)
}

function discoverGTSXPreviewFiles(root, projectRoot) {
  const directory = resolve(root, projectRoot)
  if (!existsSync(directory)) return []

  const files = []
  walk(directory)
  return files.map((filePath) => relative(root, filePath).split(sep).join("/")).sort((left, right) => left.localeCompare(right))

  function walk(currentDirectory) {
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

function createGTSXNextPreviewEntriesModule(root, outputPath, files) {
  const entries = files.map((filePath) => {
    const absoluteFilePath = resolve(root, filePath)
    return `  ${JSON.stringify(filePath)}: () => import(${JSON.stringify(toGeneratedImportSpecifier(outputPath, absoluteFilePath))}),`
  })

  return `import type { ComponentType } from "react"

export type GTSXPreviewCase<Props = Record<string, unknown>> = {
  props: Props
  scope?: unknown
}

export type GTSXPreviewComponent<Props = Record<string, unknown>> = ComponentType<Props> & {
  cases?: Record<string, GTSXPreviewCase<Props>>
}

export type GTSXPreviewModule = Record<string, unknown>
export type GTSXPreviewEntryLoader = () => Promise<GTSXPreviewModule>
export type GTSXPreviewEntryLoaders = Record<string, GTSXPreviewEntryLoader>

export const gtsxPreviewEntryLoaders = {
${entries.join("\n")}
} satisfies GTSXPreviewEntryLoaders

export async function loadGTSXPreviewComponent(entry: string): Promise<GTSXPreviewComponent | undefined> {
  const { file, exportName } = parseGTSXPreviewEntry(entry)
  const loader = gtsxPreviewEntryLoaders[file]
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

function toGeneratedImportSpecifier(outputPath, absoluteFilePath) {
  const extensionless = absoluteFilePath.replace(/\.tsx$/, "")
  const relativePath = relative(dirname(outputPath), extensionless).split(sep).join("/")
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`
}

function readFileIfExists(path) {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

module.exports = {
  gtsxNextReact,
}
