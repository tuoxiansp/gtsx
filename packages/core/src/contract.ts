export type RunelightDiagnosticStage =
  | "contract-extraction"
  | "typescript"
  | "adapter-configuration"
  | "project-compilation"
  | "preview-environment-loading"
  | "frame-rendering"
  | "browser-capture"

export type RunelightDiagnostic = {
  stage: RunelightDiagnosticStage
  code: string
  message: string
  severity: "error" | "warning"
  file?: string
  frameName?: string
}

export type RunelightProviderVariantSelection = string | string[]

export type RunelightFrameSummary = {
  kind: "pure" | "scope"
  name: string
  providerVariants?: Record<string, RunelightProviderVariantSelection>
  providers?: string[]
}

export type RunelightProviderSummary = {
  name: string
  frames: string[]
  variants?: string[]
}

export type RunelightEntryAnalysisResult = {
  entry: string
  mode: "pure" | "scope" | "unknown"
  defaultExport: boolean
  frames: RunelightFrameSummary[]
  providers: Record<string, RunelightProviderSummary>
  diagnostics: RunelightDiagnostic[]
}

export type RunelightEntryAnalysisOptions<Cache = unknown> = {
  cache?: Cache
  cwd: string
  entry: string
}

export type RunelightContractFile = {
  filePath: string
  sourceHash: string
  sourceText: string
}

export type RunelightContractComponent = {
  coordinate: string
  filePath: string
  sourceHash: string
  exportName: string
  componentName: string
  mode: RunelightEntryAnalysisResult["mode"]
  frames: RunelightEntryAnalysisResult["frames"]
  providers: RunelightEntryAnalysisResult["providers"]
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  dependencies?: string[]
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  frameDependencies?: Record<string, string[]>
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  frameVisualSignatures?: Record<string, string>
  /**
   * @internal Static metadata consumed by Studio and workspace change classification.
   */
  visualSignature?: string
  diagnostics: RunelightDiagnostic[]
}

export type RunelightContractIndexFileResult = {
  components: RunelightContractComponent[]
  diagnostics: RunelightDiagnostic[]
}

export type RunelightContractCacheContext = {
  cwd: string
  files: ReadonlyMap<string, RunelightContractFile>
  tsconfigPath?: string
}

export type RunelightContractIndexFileContext<Cache = unknown> = {
  cache?: Cache
  cwd: string
  file: RunelightContractFile
  files: ReadonlyMap<string, RunelightContractFile>
  tsconfigPath?: string
}

export type RunelightContract<Cache = unknown> = {
  id: string
  isEntryFile(filePath: string): boolean
  isTypeScriptProgramFile?(filePath: string): boolean
  analyzeEntry(options: RunelightEntryAnalysisOptions<Cache>): RunelightEntryAnalysisResult
  createCache?(context: RunelightContractCacheContext): Cache
  indexFile(context: RunelightContractIndexFileContext<Cache>): RunelightContractIndexFileResult
}

export type RunelightContractReference = string | RunelightContract

export type ResolveRunelightContractReferencesOptions = {
  cwd?: string
}

export async function resolveRunelightContractReferences(
  references: readonly RunelightContractReference[],
  options: ResolveRunelightContractReferencesOptions = {},
): Promise<RunelightContract[]> {
  const contracts: RunelightContract[] = []

  for (const reference of references) {
    if (typeof reference !== "string") {
      contracts.push(reference)
      continue
    }

    const moduleValue = await import(
      /* webpackIgnore: true */
      resolveContractReferenceSpecifier(reference, options.cwd)
    ) as Record<string, unknown>
    const contract = moduleValue.default
    if (!isRunelightContract(contract)) {
      throw new Error(`Runelight contract module must default export a contract: ${reference}`)
    }
    contracts.push(contract)
  }

  return contracts
}

function resolveContractReferenceSpecifier(reference: string, cwd: string | undefined): string {
  if (!cwd) return reference

  const configRequire = createRequire(resolve(cwd, "runelight.config.js"))
  try {
    return pathToFileURL(configRequire.resolve(reference, { paths: [cwd] })).href
  } catch (error) {
    const workspaceSource = resolveWorkspaceContractSource(reference, cwd)
    if (workspaceSource) return pathToFileURL(workspaceSource).href
    throw error
  }
}

function resolveWorkspaceContractSource(reference: string, cwd: string): string | undefined {
  const match = /^@runelight\/([^/]+)\/contract$/.exec(reference)
  if (!match) return undefined

  let current = resolve(cwd)
  while (true) {
    const candidate = join(current, "packages", match[1] ?? "", "src/contract.ts")
    if (existsSync(candidate)) return candidate

    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

export function isRunelightContract(value: unknown): value is RunelightContract {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as RunelightContract).id === "string" &&
      typeof (value as RunelightContract).isEntryFile === "function" &&
      typeof (value as RunelightContract).analyzeEntry === "function" &&
      typeof (value as RunelightContract).indexFile === "function",
  )
}
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
