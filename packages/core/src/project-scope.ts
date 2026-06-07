import { existsSync, statSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
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

  return [...files].sort((left, right) => left.localeCompare(right))
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
