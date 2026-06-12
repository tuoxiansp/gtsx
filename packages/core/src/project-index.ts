import { createHash } from "node:crypto"
import { readdirSync, readFileSync, type Dirent } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

import type {
  RunelightContract,
  RunelightContractComponent,
  RunelightContractFile,
  RunelightDiagnostic,
} from "./contract.js"
import { discoverRunelightProgramFiles, findNearestTSConfig } from "./project-scope.js"

export type RunelightProjectIndexComponent = RunelightContractComponent

export type RunelightProjectIndexFile = {
  path: string
  sourceHash: string
  components: RunelightProjectIndexComponent[]
  diagnostics: RunelightDiagnostic[]
}

export type RunelightProjectIndex = {
  version: 1
  files: RunelightProjectIndexFile[]
  diagnostics: RunelightDiagnostic[]
}

export type BuildRunelightProjectIndexOptions = {
  additionalSourceRoots?: string[]
  contracts: readonly RunelightContract[]
  cwd: string
  sourceRoot: string
  tsconfigPath?: string
}

export type RunelightProjectIndexCacheOptions = {
  ttlMs?: number
}

const IGNORED_DISCOVERY_DIRS = new Set(["node_modules", "dist", ".vite", ".next", ".git", ".runelight"])
const DEFAULT_PROJECT_INDEX_CACHE_TTL_MS = 1000
const globalProjectIndexCacheSymbol = Symbol.for("runelight.project-index.cache")

type ProjectIndexCacheEntry = {
  cachedAt: number
  index: RunelightProjectIndex
}

type GlobalProjectIndexCache = typeof globalThis & {
  [globalProjectIndexCacheSymbol]?: Map<string, ProjectIndexCacheEntry>
}

export function buildRunelightProjectIndex(options: BuildRunelightProjectIndexOptions): RunelightProjectIndex {
  const contracts = [...options.contracts]
  if (contracts.length === 0) {
    return {
      version: 1,
      files: [],
      diagnostics: [missingContractsDiagnostic()],
    }
  }
  const duplicateContractIds = duplicatedContractIds(contracts)
  if (duplicateContractIds.length > 0) {
    return {
      version: 1,
      files: [],
      diagnostics: [duplicateContractsDiagnostic(duplicateContractIds)],
    }
  }

  const selectedTSConfigPath = options.tsconfigPath ?? findNearestTSConfig(options.cwd)
  const files = new Map(
    discoverRunelightFiles(options.cwd, options.sourceRoot, selectedTSConfigPath, options.additionalSourceRoots, contracts).map((filePath) => {
      const file = readRunelightContractFile(options.cwd, filePath)
      return [file.filePath, file] as const
    }),
  )
  const cachesByContract = new Map(
    contracts.map((contract) => [
      contract,
      contract.createCache?.({
        cwd: options.cwd,
        files,
        tsconfigPath: selectedTSConfigPath,
      }),
    ] as const),
  )
  const indexedFiles = [...files.values()].map((file) => buildProjectIndexFile(options.cwd, file, files, selectedTSConfigPath, contracts, cachesByContract))

  return {
    version: 1,
    files: indexedFiles,
    diagnostics: indexedFiles.flatMap((file) => file.diagnostics),
  }
}

export function createCachedRunelightProjectIndexBuilder(cacheOptions: RunelightProjectIndexCacheOptions = {}) {
  const ttlMs = cacheOptions.ttlMs ?? DEFAULT_PROJECT_INDEX_CACHE_TTL_MS
  const cache = globalProjectIndexCache()

  return (options: BuildRunelightProjectIndexOptions): RunelightProjectIndex => {
    const key = projectIndexCacheKey(options)
    const now = Date.now()
    const cached = cache.get(key)
    if (cached && now - cached.cachedAt <= ttlMs) {
      return cached.index
    }

    const index = buildRunelightProjectIndex(options)
    cache.set(key, { cachedAt: now, index })
    return index
  }
}

function globalProjectIndexCache(): Map<string, ProjectIndexCacheEntry> {
  const globalCache = globalThis as GlobalProjectIndexCache
  globalCache[globalProjectIndexCacheSymbol] ??= new Map()
  return globalCache[globalProjectIndexCacheSymbol]
}

function buildProjectIndexFile(
  cwd: string,
  file: RunelightContractFile,
  files: ReadonlyMap<string, RunelightContractFile>,
  tsconfigPath: string | undefined,
  contracts: readonly RunelightContract[],
  cachesByContract: ReadonlyMap<RunelightContract, unknown>,
): RunelightProjectIndexFile {
  const contract = contractForEntryFile(contracts, file.filePath)
  if (!contract) {
    const diagnostics: RunelightDiagnostic[] = [
      {
        stage: "contract-extraction",
        severity: "error",
        code: "missing-entry-contract",
        message: `No Runelight contract is configured for ${file.filePath}.`,
        file: file.filePath,
      },
    ]
    return {
      path: file.filePath,
      sourceHash: file.sourceHash,
      components: [],
      diagnostics,
    }
  }

  try {
    const result = contract.indexFile({
      cache: cachesByContract.get(contract),
      cwd,
      file,
      files,
      tsconfigPath,
    })

    return {
      path: file.filePath,
      sourceHash: file.sourceHash,
      components: result.components,
      diagnostics: result.diagnostics,
    }
  } catch (error) {
    const diagnostics: RunelightDiagnostic[] = [
      {
        stage: "contract-extraction",
        severity: "error",
        code: "contract-index-failed",
        message: error instanceof Error ? error.message : String(error),
        file: file.filePath,
      },
    ]
    return {
      path: file.filePath,
      sourceHash: file.sourceHash,
      components: [],
      diagnostics,
    }
  }
}

function readRunelightContractFile(cwd: string, filePath: string): RunelightContractFile {
  const sourceText = readFileSync(resolve(cwd, filePath), "utf8")
  return {
    filePath,
    sourceHash: hashSourceText(sourceText),
    sourceText,
  }
}

function projectIndexCacheKey(options: BuildRunelightProjectIndexOptions): string {
  return JSON.stringify({
    cwd: resolve(options.cwd),
    additionalSourceRoots: options.additionalSourceRoots?.map((root) => normalizeSourceRoot(root)).sort(),
    contracts: options.contracts.map((contract) => contract.id),
    sourceRoot: options.sourceRoot,
    tsconfigPath: options.tsconfigPath ? resolve(options.cwd, options.tsconfigPath) : undefined,
  })
}

function discoverRunelightFiles(
  cwd: string,
  sourceRoot: string,
  tsconfigPath: string | undefined,
  additionalSourceRoots: string[] = [],
  contracts: readonly RunelightContract[],
): string[] {
  const files = new Set<string>()
  const programFiles = new Set<string>()

  if (tsconfigPath) {
    for (const filePath of discoverRunelightProgramFiles({ cwd, root: sourceRoot, tsconfigPath })) {
      programFiles.add(filePath)
      if (isRunelightProjectFileName(filePath, contracts, programFiles)) files.add(filePath)
    }
  }

  collectRunelightFiles(resolve(cwd, sourceRoot), files, cwd, contracts, tsconfigPath ? programFiles : undefined)
  for (const root of additionalSourceRoots) {
    collectRunelightFiles(resolve(cwd, root), files, cwd, contracts)
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

function collectRunelightFiles(
  root: string,
  files: Set<string>,
  cwd: string,
  contracts: readonly RunelightContract[],
  programFiles?: ReadonlySet<string>,
) {
  walk(root)

  function walk(directory: string) {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        if (!IGNORED_DISCOVERY_DIRS.has(dirent.name)) {
          walk(join(directory, dirent.name))
        }
        continue
      }

      const filePath = relative(cwd, join(directory, dirent.name)).split(sep).join("/")
      if (dirent.isFile() && isRunelightProjectFileName(filePath, contracts, programFiles)) {
        files.add(filePath)
      }
    }
  }
}

function isRunelightProjectFileName(
  filePath: string,
  contracts: readonly RunelightContract[],
  programFiles?: ReadonlySet<string>,
): boolean {
  const contract = contractForEntryFile(contracts, filePath)
  if (!contract) return false
  return !programFiles || !contract.isTypeScriptProgramFile?.(filePath) || programFiles.has(filePath)
}

function contractForEntryFile(contracts: readonly RunelightContract[], filePath: string): RunelightContract | undefined {
  return contracts.find((contract) => contract.isEntryFile(filePath))
}

function normalizeSourceRoot(root: string): string {
  return root.replaceAll("\\", "/").replace(/\/+$/, "") || "."
}

function hashSourceText(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex")
}

function missingContractsDiagnostic(): RunelightDiagnostic {
  return {
    stage: "adapter-configuration",
    severity: "error",
    code: "missing-contracts",
    message: 'Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].',
  }
}

function duplicatedContractIds(contracts: readonly RunelightContract[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const contract of contracts) {
    if (seen.has(contract.id)) {
      duplicates.add(contract.id)
    } else {
      seen.add(contract.id)
    }
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right))
}

function duplicateContractsDiagnostic(contractIds: readonly string[]): RunelightDiagnostic {
  return {
    stage: "adapter-configuration",
    severity: "error",
    code: "duplicate-contracts",
    message: `Runelight contracts must have unique ids. Duplicate contract ids: ${contractIds.join(", ")}.`,
  }
}
