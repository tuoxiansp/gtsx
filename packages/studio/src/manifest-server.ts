import { loadGTSXConfig, resolveGTSXConfig } from "gtsx/config"
import type { GTSXConfig } from "gtsx"
import { createCachedGTSXProjectIndexBuilder } from "gtsx/project-index"

import { createStudioManifestFromGTSXConfig, type StudioManifest } from "./manifest"

export type CreateStudioManifestProviderOptions = {
  config?: GTSXConfig
  cwd?: string
}

export function createStudioManifestProvider(options: CreateStudioManifestProviderOptions = {}): () => StudioManifest {
  const cwd = options.cwd ?? "."
  const config = options.config ?? loadRequiredGTSXConfig(cwd)
  const resolved = resolveGTSXConfig(config)
  const buildProjectIndex = createCachedGTSXProjectIndexBuilder({
    ttlMs: resolved.studio.manifestCacheTtlMs,
  })

  return () =>
    createStudioManifestFromGTSXConfig(
      buildProjectIndex({
        cwd,
        projectRoot: resolved.project.root,
        tsconfigPath: resolved.project.tsconfig,
      }),
      config,
    )
}

function loadRequiredGTSXConfig(cwd: string): GTSXConfig {
  const result = loadGTSXConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing gtsx.config.ts.")
}
