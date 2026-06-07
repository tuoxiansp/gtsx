/// <reference types="vite/client" />

declare module "virtual:runelight/project-index" {
  import type { RunelightProjectIndex } from "@runelight/core/project-index"

  const projectIndex: RunelightProjectIndex
  export default projectIndex
}

declare module "virtual:runelight/config" {
  import type { ResolvedRunelightConfig } from "@runelight/core"

  const config: ResolvedRunelightConfig
  export default config
}
