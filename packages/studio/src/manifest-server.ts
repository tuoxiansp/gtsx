import { existsSync, readdirSync } from "node:fs"
import { basename, join, relative, sep } from "node:path"

import { loadGTSXConfig, resolveGTSXConfig } from "@gtsx/core/config"
import type { GTSXConfig } from "@gtsx/core"
import { createCachedGTSXProjectIndexBuilder } from "@gtsx/core/project-index"

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

  return () =>
    createStudioManifestFromGTSXConfig(
      buildProjectIndex({
        cwd,
        projectRoot: resolved.project.root,
        tsconfigPath: resolved.project.tsconfig,
      }),
      config,
      {
        design: discoverStudioDesignManifest(cwd, resolved.project.root),
      },
    )
}

export function discoverStudioDesignManifest(cwd: string, projectRoot = "src"): StudioDesignManifest {
  const designRoot = join(cwd, projectRoot, ".gtsx", "design")
  const frames = existsSync(designRoot)
    ? listStudioDesignEntryFiles(designRoot).map((absoluteFilePath) => {
        const filePath = relative(cwd, absoluteFilePath).split(sep).join("/")
        const exportName = "default"
        const entry = `${filePath}#${exportName}`
        return {
          id: entry,
          entry,
          filePath,
          title: basename(filePath).replace(/\.g\.tsx$/, ""),
          exportName,
          caseName: "live",
        }
      })
    : []

  return { frames }
}

function loadRequiredGTSXConfig(cwd: string): GTSXConfig {
  const result = loadGTSXConfig(cwd)
  if (result.config) return result.config

  const message = result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")
  throw new Error(message || "Missing gtsx.config.ts.")
}

function listStudioDesignEntryFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolutePath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...listStudioDesignEntryFiles(absolutePath))
    } else if (entry.isFile() && entry.name.endsWith(".g.tsx")) {
      files.push(absolutePath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}
