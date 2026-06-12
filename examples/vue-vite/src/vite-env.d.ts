/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue"

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module "virtual:runelight/preview-config" {
  const config: {
    project: {
      sourceRoot: string
    }
  }
  export default config
}

declare const __RUNELIGHT_DEV__: boolean
