import { loadGTSXConfig, resolveGTSXConfig } from "@gtsx/core/config"
import { requireGTSXEntryRoot } from "@gtsx/core/config-model"
import type { GTSXConfig } from "@gtsx/core"
import { createCachedGTSXProjectIndexBuilder } from "@gtsx/core/project-index"

import { createStudioManifestFromGTSXConfig, studioDesignRoots, type StudioManifest } from "./manifest"

export { discoverStudioDesignManifest, studioDesignRoots } from "./manifest"

export type CreateStudioManifestProviderOptions = {
  config?: GTSXConfig
  cwd?: string
}

export function createStudioManifestProvider(options: CreateStudioManifestProviderOptions = {}): () => StudioManifest {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredGTSXConfig(cwd)
  const resolved = resolveGTSXConfig(config)
  const entryRoot = requireGTSXEntryRoot(resolved)
  const buildProjectIndex = createCachedGTSXProjectIndexBuilder({
    ttlMs: resolved.studio.manifestCacheTtlMs,
  })

  return () => {
    const projectIndex = buildProjectIndex({
      additionalRoots: studioDesignRoots(entryRoot),
      cwd,
      sourceRoot: resolved.project.sourceRoot,
      tsconfigPath: resolved.project.tsconfig,
    })

    return createStudioManifestFromGTSXConfig(projectIndex, config)
  }
}

function loadRequiredGTSXConfig(cwd: string): GTSXConfig {
  const result = loadGTSXConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing gtsx.config.ts.")
}
