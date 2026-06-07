export type RunelightConfig = {
  project?: RunelightProjectConfig
  preview: {
    serve?: string
    studioUrl?: string
    url?: string
    allUrl?: string
  }
  routes?: Partial<RunelightRouteConfig>
  studio?: RunelightStudioConfig
}

export type RunelightProjectConfig = {
  entryRoot?: string
  namespace?: string
  sourceRoot?: string
  tsconfig?: string
}

export type RunelightRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type RunelightScriptConfig = RunelightConfig

export type RunelightStudioConfig = {
  manifestCacheTtlMs?: number
}

export type ResolvedRunelightConfig = {
  project: Required<Pick<RunelightProjectConfig, "sourceRoot">> & Pick<RunelightProjectConfig, "entryRoot" | "namespace" | "tsconfig">
  preview: RunelightConfig["preview"]
  routes: RunelightRouteConfig
  studio: Required<RunelightStudioConfig>
}
