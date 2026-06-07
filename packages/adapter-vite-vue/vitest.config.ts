import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@runelight/preview-vue": resolve(import.meta.dirname, "../preview-vue/src/index.ts"),
      "@runelight/core/preview-protocol": resolve(import.meta.dirname, "../core/src/preview-protocol.ts"),
    },
  },
})
