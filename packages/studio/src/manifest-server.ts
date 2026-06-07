import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import { requireRunelightEntryRoot } from "@runelight/core/config-model"
import type { RunelightConfig } from "@runelight/core"
import { createCachedRunelightProjectIndexBuilder } from "@runelight/core/project-index"

import { createStudioManifestFromRunelightConfig, studioDesignRoots, type StudioManifest } from "./manifest"

export { discoverStudioDesignManifest, studioDesignRoots } from "./manifest"

export type CreateStudioManifestProviderOptions = {
  config?: RunelightConfig
  cwd?: string
}

export function createStudioManifestProvider(options: CreateStudioManifestProviderOptions = {}): () => StudioManifest {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredRunelightConfig(cwd)
  const resolved = resolveRunelightConfig(config)
  const entryRoot = requireRunelightEntryRoot(resolved)
  const buildProjectIndex = createCachedRunelightProjectIndexBuilder({
    ttlMs: resolved.studio.manifestCacheTtlMs,
  })

  return () => {
    const projectIndex = buildProjectIndex({
      additionalRoots: studioDesignRoots(entryRoot),
      cwd,
      sourceRoot: resolved.project.sourceRoot,
      tsconfigPath: resolved.project.tsconfig,
    })

    return createStudioManifestFromRunelightConfig(projectIndex, config)
  }
}

function loadRequiredRunelightConfig(cwd: string): RunelightConfig {
  const result = loadRunelightConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing runelight.config.ts.")
}
