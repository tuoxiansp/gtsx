/// <reference types="vite/client" />

declare module "virtual:runelight/preview-config" {
  const config: {
    project: {
      sourceRoot: string
    }
  }
  export default config
}

declare const __RUNELIGHT_DEV__: boolean
