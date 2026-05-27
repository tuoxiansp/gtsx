import type { GTSXConfig, GTSXRouteConfig, ResolvedGTSXConfig } from "./config-types.js"

export const DEFAULT_GTSX_PROJECT_ROOT = "src"
export const DEFAULT_GTSX_ROUTES: GTSXRouteConfig = {
  preview: "/gtsx",
  studio: "/gtsx/studio",
  manifest: "/gtsx/studio/manifest",
}
export const DEFAULT_STUDIO_MANIFEST_CACHE_TTL_MS = 1000

export function resolveGTSXConfig(config: GTSXConfig): ResolvedGTSXConfig {
  return {
    project: {
      root: config.project?.root ?? DEFAULT_GTSX_PROJECT_ROOT,
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
