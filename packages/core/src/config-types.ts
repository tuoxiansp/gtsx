export type RunelightConfig = {
  contracts: readonly string[]
  host?: RunelightHostConfig
  project: RunelightProjectConfig
  studio?: RunelightStudioConfig
}

export type RunelightHostConfig = {
  command?: string
}

export type RunelightProjectConfig = {
  entryRoot: string
  namespace?: string
  sourceRoot: string
  tsconfig?: string
}

export type RunelightRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type RunelightStudioConfig = {
  exposeInProduction?: boolean
}

export type ResolvedRunelightConfig = {
  host: RunelightHostConfig
  project: Required<Pick<RunelightProjectConfig, "entryRoot" | "sourceRoot">> & Pick<RunelightProjectConfig, "namespace" | "tsconfig">
  routes: RunelightRouteConfig
  studio: Required<RunelightStudioConfig>
}
