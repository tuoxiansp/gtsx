/// <reference types="vite/client" />

declare module "virtual:gtsx/studio-manifest" {
  import type { StudioManifest } from "gtsx/studio/server"

  const manifest: StudioManifest
  export default manifest
}
