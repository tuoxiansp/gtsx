import { existsSync } from "node:fs"
import { join } from "node:path"

import type { GTSXDiagnostic } from "./analyzer.js"
import { loadGTSXConfig } from "./config.js"
import { buildGTSXProjectIndex } from "./project-index.js"
import { createStudioManifest } from "./studio-manifest-model.js"
import type { StudioManifest, StudioManifestPreviewConfig, StudioManifestRouteConfig } from "./studio-manifest-model.js"

export { createStudioManifest } from "./studio-manifest-model.js"
export type {
  CreateStudioManifestOptions,
  StudioManifest,
  StudioManifestComponent,
  StudioManifestFile,
  StudioManifestPreviewConfig,
  StudioManifestRouteConfig,
} from "./studio-manifest-model.js"

export type BuildStudioManifestOptions = {
  cwd: string
  projectRoot?: string
  tsconfigPath?: string
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
}

export type StudioManifestProviderCandidate = {
  kind: "server-route" | "virtual-module"
  manifest?: StudioManifest
}

export type StudioManifestProviderSelection = {
  kind?: StudioManifestProviderCandidate["kind"]
  manifest?: StudioManifest
  diagnostics: GTSXDiagnostic[]
}

export function buildStudioManifest(options: BuildStudioManifestOptions): StudioManifest {
  const projectRoot = options.projectRoot ?? "."
  const projectIndex = buildGTSXProjectIndex({
    cwd: options.cwd,
    projectRoot,
    tsconfigPath: options.tsconfigPath,
  })
  const configuredPreview = readConfiguredPreview(options.cwd)

  return createStudioManifest(projectIndex, {
    diagnostics: configuredPreview.diagnostics,
    preview: { ...configuredPreview.preview, ...options.preview },
    routes: options.routes,
  })
}

export function selectStudioManifestProvider(
  candidates: StudioManifestProviderCandidate[],
): StudioManifestProviderSelection {
  const serverRoute = candidates.find((candidate) => candidate.kind === "server-route" && candidate.manifest)
  if (serverRoute?.manifest) {
    return { kind: "server-route", manifest: serverRoute.manifest, diagnostics: [] }
  }

  const virtualModule = candidates.find((candidate) => candidate.kind === "virtual-module" && candidate.manifest)
  if (virtualModule?.manifest) {
    return { kind: "virtual-module", manifest: virtualModule.manifest, diagnostics: [] }
  }

  return {
    diagnostics: [
      {
        stage: "adapter-configuration",
        code: "missing-studio-manifest-provider",
        message:
          "No Studio manifest provider is available. Create a /gtsx/studio/manifest server route or enable the adapter virtual:gtsx/studio-manifest fallback.",
      },
    ],
  }
}

function readConfiguredPreview(cwd: string): { preview: Partial<StudioManifestPreviewConfig>; diagnostics: GTSXDiagnostic[] } {
  if (!hasGTSXConfig(cwd)) return { preview: {}, diagnostics: [] }

  const config = loadGTSXConfig(cwd)
  if (!config.config) return { preview: {}, diagnostics: config.diagnostics }

  return {
    preview: {
      ...(config.config.preview.url ? { urlTemplate: config.config.preview.url } : {}),
      ...(config.config.preview.allUrl ? { allUrlTemplate: config.config.preview.allUrl } : {}),
    },
    diagnostics: [],
  }
}

function hasGTSXConfig(cwd: string): boolean {
  return ["gtsx.config.ts", "gtsx.config.js", "gtsx.config.cjs"].some((fileName) => existsSync(join(cwd, fileName)))
}
