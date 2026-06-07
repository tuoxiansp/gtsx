import { existsSync, readdirSync, statSync, type Dirent } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import ts from "typescript"

export type DiscoverRunelightProgramFilesOptions = {
  cwd: string
  root: string
  tsconfigPath: string
}

export function discoverRunelightProgramFiles(options: DiscoverRunelightProgramFilesOptions): string[] {
  const root = resolve(options.cwd, options.root)
  const configPath = resolve(options.cwd, options.tsconfigPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) return []

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  const files = new Set<string>()
  const runelightInternalRoot = resolve(root, ".runelight")

  for (const fileName of parsed.fileNames) {
    const filePath = resolve(fileName)
    if (filePath.endsWith(".g.tsx") && isPathInside(root, filePath) && !isPathInside(runelightInternalRoot, filePath)) {
      files.add(relative(options.cwd, filePath).split(sep).join("/"))
    }
  }

  collectRunelightVueFiles(root, files, options.cwd, runelightInternalRoot)

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectRunelightVueFiles(root: string, files: Set<string>, cwd: string, ignoredRoot: string) {
  walk(root)

  function walk(directory: string) {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const dirent of dirents) {
      const childPath = join(directory, dirent.name)
      if (dirent.isDirectory()) {
        if (!new Set(["node_modules", "dist", ".vite", ".next", ".git", ".runelight"]).has(dirent.name)) {
          walk(childPath)
        }
        continue
      }

      if (dirent.isFile() && childPath.endsWith(".g.vue") && !isPathInside(ignoredRoot, childPath)) {
        files.add(relative(cwd, childPath).split(sep).join("/"))
      }
    }
  }
}

export function findNearestTSConfig(cwd: string): string | undefined {
  let directory = resolve(cwd)

  while (true) {
    const candidate = resolve(directory, "tsconfig.json")
    if (statOrUndefined(candidate)?.isFile()) {
      return candidate
    }

    if (hasRunelightConfig(directory)) {
      return undefined
    }

    const parent = dirname(directory)
    if (parent === directory) {
      return undefined
    }
    directory = parent
  }
}

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath)
  return relativePath === "" || (!relativePath.startsWith("..") && relativePath !== "..")
}

function hasRunelightConfig(cwd: string): boolean {
  return ["runelight.config.ts", "runelight.config.js", "runelight.config.cjs"].some((fileName) => existsSync(resolve(cwd, fileName)))
}

function statOrUndefined(path: string) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}
