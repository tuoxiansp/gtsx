export type RunelightConfig = {
  host?: RunelightHostConfig
  project?: RunelightProjectConfig
  studio?: RunelightStudioConfig
}

export type RunelightHostConfig = {
  command?: string
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
  exposeInProduction?: boolean
  manifestCacheTtlMs?: number
}

export type ResolvedRunelightConfig = {
  host: RunelightHostConfig
  project: Required<Pick<RunelightProjectConfig, "sourceRoot">> & Pick<RunelightProjectConfig, "entryRoot" | "namespace" | "tsconfig">
  routes: RunelightRouteConfig
  studio: Required<RunelightStudioConfig>
}
