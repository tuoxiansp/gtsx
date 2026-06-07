import { existsSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const studioAppDistDirectoryName = "studio"

export function runelightStudioAppDirectory(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))

  if (moduleDirectory.endsWith(`${sep}src`)) {
    return resolve(moduleDirectory, "..", "dist", studioAppDistDirectoryName)
  }

  return resolve(moduleDirectory, studioAppDistDirectoryName)
}

export function resolveRunelightStudioAppAssetPath(assetPath = "index.html"): string {
  const normalizedAssetPath = normalizeStudioAppAssetPath(assetPath)
  return resolve(runelightStudioAppDirectory(), normalizedAssetPath)
}

export function hasRunelightStudioAppAsset(assetPath = "index.html"): boolean {
  return existsSync(resolveRunelightStudioAppAssetPath(assetPath))
}

function normalizeStudioAppAssetPath(assetPath: string): string {
  const normalized = assetPath.replace(/^\/+/, "")

  if (normalized === "" || normalized.split("/").includes("..")) {
    throw new Error(`Invalid Runelight Studio asset path: ${assetPath}`)
  }

  return normalized
}
