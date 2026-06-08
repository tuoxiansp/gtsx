/// <reference types="vite/client" />

declare module "virtual:runelight/config" {
  import type { ResolvedRunelightConfig } from "@runelight/core"

  const config: ResolvedRunelightConfig
  export default config
}
