/// <reference types="vite/client" />

declare module "virtual:gtsx/studio-manifest" {
  import type { StudioManifest } from "gtsx/studio/manifest"

  const manifest: StudioManifest
  export default manifest
}

declare module "virtual:gtsx/project-index" {
  import type { GTSXProjectIndex } from "gtsx/project-index"

  const projectIndex: GTSXProjectIndex
  export default projectIndex
}
