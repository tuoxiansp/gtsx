export type GTSXConfig = {
  project?: GTSXProjectConfig
  preview: {
    serve?: string
    studioUrl?: string
    url?: string
    allUrl?: string
  }
  routes?: Partial<GTSXRouteConfig>
  studio?: GTSXStudioConfig
}

export type GTSXProjectConfig = {
  entryRoot?: string
  namespace?: string
  sourceRoot?: string
  tsconfig?: string
}

export type GTSXRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type GTSXScriptConfig = GTSXConfig

export type GTSXStudioConfig = {
  manifestCacheTtlMs?: number
}

export type ResolvedGTSXConfig = {
  project: Required<Pick<GTSXProjectConfig, "sourceRoot">> & Pick<GTSXProjectConfig, "entryRoot" | "namespace" | "tsconfig">
  preview: GTSXConfig["preview"]
  routes: GTSXRouteConfig
  studio: Required<GTSXStudioConfig>
}
