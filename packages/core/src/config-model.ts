import type { RunelightConfig, RunelightRouteConfig, ResolvedRunelightConfig } from "./config-types.js"

export const DEFAULT_RUNELIGHT_SOURCE_ROOT = "src"
export const DEFAULT_RUNELIGHT_ENTRY_ROOT = "app/runelight"
export const DEFAULT_RUNELIGHT_ROUTES: RunelightRouteConfig = {
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}
export const DEFAULT_STUDIO_MANIFEST_CACHE_TTL_MS = 1000

export function resolveRunelightConfig(config: RunelightConfig): ResolvedRunelightConfig {
  return {
    host: config.host ?? {},
    project: {
      sourceRoot: config.project?.sourceRoot ?? DEFAULT_RUNELIGHT_SOURCE_ROOT,
      ...(config.project?.entryRoot ? { entryRoot: normalizeRunelightPath(config.project.entryRoot) } : {}),
      ...(config.project?.namespace ? { namespace: config.project.namespace } : {}),
      ...(config.project?.tsconfig ? { tsconfig: config.project.tsconfig } : {}),
    },
    routes: DEFAULT_RUNELIGHT_ROUTES,
    studio: {
      exposeInProduction: config.studio?.exposeInProduction ?? false,
      manifestCacheTtlMs: config.studio?.manifestCacheTtlMs ?? DEFAULT_STUDIO_MANIFEST_CACHE_TTL_MS,
    },
  }
}

export function requireRunelightEntryRoot(config: ResolvedRunelightConfig): string {
  if (config.project.entryRoot) return config.project.entryRoot

  throw new Error(
    "Missing project.entryRoot in runelight.config.ts. Run setup-runelight again so the local /runelight entry directory is recorded.",
  )
}

export function runelightDesignRootFromEntryRoot(entryRoot: string): string {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

export function normalizeRunelightPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}
