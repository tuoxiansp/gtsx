import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import { runelightDesignRootFromEntryRoot, type RunelightConfig } from "@runelight/core"
import { resolveRunelightContractReferences } from "@runelight/core/contract"
import { createCachedRunelightProjectIndexBuilder } from "@runelight/core/project-index"

import { createStudioManifestFromResolvedConfig, type StudioManifest } from "./manifest"

export type CreateStudioManifestProviderOptions = {
  config?: RunelightConfig
  cwd?: string
}

export async function createStudioManifestProvider(options: CreateStudioManifestProviderOptions = {}): Promise<() => StudioManifest> {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredRunelightConfig(cwd)
  const resolved = resolveRunelightConfig(config)
  const entryRoot = resolved.project.entryRoot
  const contracts = await resolveRunelightContractReferences(config.contracts, { cwd })
  if (contracts.length === 0) {
    throw new Error('Add a Runelight contract to runelight.config.ts, for example contracts: ["@runelight/react/contract"].')
  }
  const buildProjectIndex = createCachedRunelightProjectIndexBuilder()

  return () => {
    const projectIndex = buildProjectIndex({
      additionalSourceRoots: studioDesignRoots(entryRoot),
      contracts,
      cwd,
      sourceRoot: resolved.project.sourceRoot,
      tsconfigPath: resolved.project.tsconfig,
    })

    return createStudioManifestFromResolvedConfig(projectIndex, resolved)
  }
}

function studioDesignRoots(entryRoot: string): string[] {
  return [runelightDesignRootFromEntryRoot(entryRoot)]
}

function loadRequiredRunelightConfig(cwd: string): RunelightConfig {
  const result = loadRunelightConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing runelight.config.ts.")
}
