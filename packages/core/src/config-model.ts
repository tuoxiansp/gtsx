import type { RunelightConfig, RunelightProjectConfig, RunelightRouteConfig, ResolvedRunelightConfig } from "./config-types.js"

export const DEFAULT_RUNELIGHT_ROUTES: RunelightRouteConfig = {
  preview: "/runelight",
  studio: "/runelight/studio",
  manifest: "/runelight/studio/manifest",
}
export const RUNELIGHT_HOST_PORT_PLACEHOLDER = "{port}"

export function resolveRunelightConfig(config: RunelightConfig): ResolvedRunelightConfig {
  assertRunelightConfig(config)

  return {
    host: config.host ?? {},
    project: {
      entryRoot: normalizeRunelightPath(config.project.entryRoot),
      sourceRoot: normalizeRunelightPath(config.project.sourceRoot),
      ...(config.project?.namespace ? { namespace: config.project.namespace } : {}),
      ...(config.project?.tsconfig ? { tsconfig: config.project.tsconfig } : {}),
    },
    routes: DEFAULT_RUNELIGHT_ROUTES,
    studio: {
      exposeInProduction: config.studio?.exposeInProduction ?? false,
    },
  }
}

export function runelightDesignRootFromEntryRoot(entryRoot: string): string {
  const root = normalizeRunelightPath(entryRoot)
  return root === "." ? "design" : `${root}/design`
}

export function normalizeRunelightPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "")
  return normalized || "."
}

function assertRunelightConfig(config: RunelightConfig): void {
  const messages: string[] = []
  const candidate = config as Partial<RunelightConfig>

  if (!Array.isArray(candidate.contracts) || candidate.contracts.length === 0) {
    messages.push('Missing contracts in runelight.config.ts. Add a framework contract, for example contracts: ["@runelight/react/contract"].')
  } else if (!candidate.contracts.every(isNonEmptyString)) {
    messages.push('Invalid contracts in runelight.config.ts. Use string specifiers, for example contracts: ["@runelight/react/contract"].')
  }
  if (!candidate.project || !isNonEmptyString((candidate.project as Partial<RunelightProjectConfig>).entryRoot)) {
    messages.push("Missing project.entryRoot in runelight.config.ts. Record the local /runelight entry directory, for example project: { entryRoot: \"app/runelight\" }.")
  }
  if (!candidate.project || !isNonEmptyString((candidate.project as Partial<RunelightProjectConfig>).sourceRoot)) {
    messages.push("Missing project.sourceRoot in runelight.config.ts. Record the source directory to scan, for example project: { sourceRoot: \"src\" } or project: { sourceRoot: \".\" }.")
  }
  if (candidate.host?.command !== undefined && !isRunelightHostCommandWithPortPlaceholder(candidate.host.command)) {
    messages.push('Invalid host.command in runelight.config.ts. Include the {port} placeholder so Runelight can choose and substitute the Host port.')
  }

  if (messages.length > 0) throw new Error(messages.join("\n"))
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isRunelightHostCommandWithPortPlaceholder(command: unknown): command is string {
  return isNonEmptyString(command) && command.includes(RUNELIGHT_HOST_PORT_PLACEHOLDER)
}
