/// <reference types="vite/client" />

declare module "virtual:runelight/project-index" {
  import type { RunelightProjectIndex } from "@runelight/core/project-index"

  const projectIndex: RunelightProjectIndex
  export default projectIndex
}

declare module "virtual:runelight/preview-config" {
  const config: {
    project: {
      sourceRoot: string
    }
  }
  export default config
}
