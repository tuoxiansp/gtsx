import { existsSync, statSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import ts from "typescript"

export type DiscoverGTSXProgramFilesOptions = {
  cwd: string
  root: string
  tsconfigPath: string
}

export function discoverGTSXProgramFiles(options: DiscoverGTSXProgramFilesOptions): string[] {
  const root = resolve(options.cwd, options.root)
  const configPath = resolve(options.cwd, options.tsconfigPath)
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) return []

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath))
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  })
  const files = new Set<string>()

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = resolve(sourceFile.fileName)
    if (filePath.endsWith(".g.tsx") && isPathInside(root, filePath)) {
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

    if (hasGTSXConfig(directory)) {
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

function hasGTSXConfig(cwd: string): boolean {
  return ["gtsx.config.ts", "gtsx.config.js", "gtsx.config.cjs"].some((fileName) => existsSync(resolve(cwd, fileName)))
}

function statOrUndefined(path: string) {
  try {
    return statSync(path)
  } catch {
    return undefined
  }
}
