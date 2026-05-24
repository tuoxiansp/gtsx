import type { GTSXDiagnostic } from "./analyzer.js"
import type { GTSXProjectIndex, GTSXProjectIndexComponent } from "./project-index.js"

export type StudioManifestRouteConfig = {
  preview: string
  studio: string
  manifest: string
}

export type StudioManifestPreviewConfig = {
  urlTemplate: string
  allUrlTemplate?: string
}

export type StudioManifestComponent = {
  coordinate: string
  filePath: string
  exportName: string
  componentName: string
  mode: GTSXProjectIndexComponent["mode"]
  cases: GTSXProjectIndexComponent["cases"]
  providers: GTSXProjectIndexComponent["providers"]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifestFile = {
  path: string
  groupId: string
  components: StudioManifestComponent[]
  diagnostics: GTSXDiagnostic[]
}

export type StudioManifest = {
  version: 1
  routes: StudioManifestRouteConfig
  preview: StudioManifestPreviewConfig
  files: StudioManifestFile[]
  diagnostics: GTSXDiagnostic[]
}

export type CreateStudioManifestOptions = {
  routes?: Partial<StudioManifestRouteConfig>
  preview?: Partial<StudioManifestPreviewConfig>
  diagnostics?: GTSXDiagnostic[]
}

const DEFAULT_ROUTES: StudioManifestRouteConfig = {
  preview: "/gtsx",
  studio: "/gtsx/studio",
  manifest: "/gtsx/studio/manifest",
}

const DEFAULT_PREVIEW: StudioManifestPreviewConfig = {
  urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
  allUrlTemplate: "/gtsx?entry={entry}{gcase}",
}

export function createStudioManifest(projectIndex: GTSXProjectIndex, options: CreateStudioManifestOptions = {}): StudioManifest {
  return {
    version: 1,
    routes: { ...DEFAULT_ROUTES, ...options.routes },
    preview: { ...DEFAULT_PREVIEW, ...options.preview },
    files: projectIndex.files.map((file) => ({
      path: file.path,
      groupId: `file:${file.path}`,
      components: file.components,
      diagnostics: file.diagnostics,
    })),
    diagnostics: [...projectIndex.diagnostics, ...(options.diagnostics ?? [])],
  }
}
