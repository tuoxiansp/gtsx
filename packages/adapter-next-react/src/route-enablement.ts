import { loadRunelightConfig, resolveRunelightConfig } from "@runelight/core/config"
import type { RunelightConfig, ResolvedRunelightConfig } from "@runelight/core"

/**
 * @internal Shared Next route enablement helper options for adapter-owned routes.
 */
export type RunelightNextRouteEnablementOptions = {
  config?: RunelightConfig
  cwd?: string
}

const runelightDevEnvName = "RUNELIGHT_DEV"

export function isRunelightNextRouteEnabled(options: RunelightNextRouteEnablementOptions = {}): boolean {
  if (process.env[runelightDevEnvName] === "1") return true

  return optionalResolvedRunelightConfig(options)?.studio.exposeInProduction === true
}

function optionalResolvedRunelightConfig(options: RunelightNextRouteEnablementOptions): ResolvedRunelightConfig | undefined {
  if (options.config) return resolveRunelightConfig(options.config)

  const loaded = loadRunelightConfig(options.cwd ?? process.cwd())
  if (!loaded.config) return undefined

  return resolveRunelightConfig(loaded.config)
}
