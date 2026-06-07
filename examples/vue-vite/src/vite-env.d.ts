/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue"

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module "virtual:runelight/config" {
  import type { ResolvedRunelightConfig } from "@runelight/core/config-types"

  const config: ResolvedRunelightConfig
  export default config
}
