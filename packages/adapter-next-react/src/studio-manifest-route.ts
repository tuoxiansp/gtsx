import type { RunelightConfig } from "@runelight/core"
import { isRunelightNextRouteEnabled } from "./route-enablement.js"

/**
 * @internal Test and nonstandard host wiring escape hatch. Normal Studio manifest route files should call helpers without passing config or cwd.
 */
export type RunelightNextStudioManifestResponseOptions = {
  config?: RunelightConfig
  cwd?: string
}

type StudioManifestServerModule = {
  createStudioManifestProvider(options?: { config?: RunelightConfig; cwd?: string }): Promise<() => unknown>
}

type RuntimeImportGlobal = typeof globalThis & {
  __runelightAdapterNextRuntimeImport?: <Module>(specifier: string) => Promise<Module>
}

const studioManifestServerModuleId = "@runelight/studio/manifest-server"
const importOpaqueRuntimeModule = new Function("specifier", "return import(specifier)") as <Module>(
  specifier: string,
) => Promise<Module>

export async function createRunelightNextStudioManifestResponse(
  options: RunelightNextStudioManifestResponseOptions = {},
): Promise<Response> {
  if (!isRunelightNextRouteEnabled(options)) return notFoundResponse()

  const { createStudioManifestProvider } = await importRuntimeModule<StudioManifestServerModule>(studioManifestServerModuleId)
  const createManifest = await createStudioManifestProvider({ config: options.config, cwd: options.cwd })
  const manifest = createManifest() as { routes?: { changes?: string; events?: string } }
  manifest.routes ??= {}
  manifest.routes.changes ??= "/runelight/studio/changes"
  manifest.routes.events ??= "/runelight/studio/events"

  return Response.json(manifest, {
    headers: {
      "cache-control": "no-store",
    },
  })
}

function importRuntimeModule<Module>(specifier: string): Promise<Module> {
  const runtimeGlobal = globalThis as RuntimeImportGlobal
  return runtimeGlobal.__runelightAdapterNextRuntimeImport?.<Module>(specifier) ?? importOpaqueRuntimeModule<Module>(specifier)
}

function notFoundResponse(): Response {
  return new Response(null, { status: 404 })
}
