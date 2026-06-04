import type { GTSXConfig, GTSXRouteConfig, ResolvedGTSXConfig } from "./config-types.js"

export const DEFAULT_GTSX_SOURCE_ROOT = "src"
export const DEFAULT_GTSX_ENTRY_ROOT = "app/gtsx"
export const DEFAULT_GTSX_ROUTES: GTSXRouteConfig = {
  preview: "/gtsx",
  studio: "/gtsx/studio",
  manifest: "/gtsx/studio/manifest",
}
export const DEFAULT_STUDIO_MANIFEST_CACHE_TTL_MS = 60_000

export function resolveGTSXConfig(config: GTSXConfig): ResolvedGTSXConfig {
  return {
    project: {
      sourceRoot: config.project?.sourceRoot ?? DEFAULT_GTSX_SOURCE_ROOT,
      ...(config.project?.entryRoot ? { entryRoot: normalizeGTSXPath(config.project.entryRoot) } : {}),
      ...(config.project?.namespace ? { namespace: config.project.namespace } : {}),
      ...(config.project?.tsconfig ? { tsconfig: config.project.tsconfig } : {}),
    },
    preview: config.preview,
    routes: {
      ...DEFAULT_GTSX_ROUTES,
      ...config.routes,
    },
    studio: {
      manifestCacheTtlMs: config.studio?.manifestCacheTtlMs ?? DEFAULT_STUDIO_MANIFEST_CACHE_TTL_MS,
    },
  }
}

export function requireGTSXEntryRoot(config: ResolvedGTSXConfig): string {
  if (config.project.entryRoot) return config.project.entryRoot

  throw new Error(
    "Missing project.entryRoot in gtsx.config.ts. Run setup-gtsx again so the local /gtsx entry directory is recorded.",
  )
}

export function gtsxDesignRootFromEntryRoot(entryRoot: string): string {
  const root = normalizeGTSXPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

export function normalizeGTSXPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}
