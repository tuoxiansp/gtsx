import { loadGTSXConfig, resolveGTSXConfig } from "@gtsx/core/config"
import type { GTSXConfig } from "@gtsx/core"
import { createCachedGTSXProjectIndexBuilder, type GTSXProjectIndex } from "@gtsx/core/project-index"

import { createStudioManifestFromGTSXConfig, type StudioDesignManifest, type StudioManifest } from "./manifest"

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

  return () => {
    const projectIndex = buildProjectIndex({
        cwd,
        projectRoot: resolved.project.root,
        tsconfigPath: resolved.project.tsconfig,
      })

    return createStudioManifestFromGTSXConfig(projectIndex, config, {
      design: discoverStudioDesignManifest(projectIndex, resolved.project.root),
    })
  }
}

export function discoverStudioDesignManifest(projectIndex: GTSXProjectIndex, projectRoot = "src"): StudioDesignManifest {
  const designPathPrefix = studioDesignPathPrefix(projectRoot)
  const frames = projectIndex.files.flatMap((file) => {
    if (!file.path.startsWith(designPathPrefix)) return []

    return file.components.flatMap((component) => {
      const componentFrames = component.frames.length > 0 ? component.frames : [{ name: "missing-frames" }]
      return componentFrames.map((frame) => {
        return {
          id: `${component.coordinate}:${frame.name}`,
          entry: component.coordinate,
          filePath: component.filePath,
          title: component.componentName,
          exportName: component.exportName,
          frameName: frame.name,
        }
      })
    })
  })

  return { frames }
}

function loadRequiredGTSXConfig(cwd: string): GTSXConfig {
  const result = loadGTSXConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing gtsx.config.ts.")
}

function studioDesignPathPrefix(projectRoot: string): string {
  const root = projectRoot.replaceAll("\\", "/").replace(/\/+$/, "")
  if (!root || root === ".") return "gtsx/design/"
  return `${root}/gtsx/design/`
}
