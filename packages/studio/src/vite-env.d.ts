/// <reference types="vite/client" />

declare module "virtual:gtsx/project-index" {
  import type { GTSXProjectIndex } from "gtsx/project-index"

  const projectIndex: GTSXProjectIndex
  export default projectIndex
}

declare module "virtual:gtsx/config" {
  import type { ResolvedGTSXConfig } from "gtsx"

  const config: ResolvedGTSXConfig
  export default config
}
