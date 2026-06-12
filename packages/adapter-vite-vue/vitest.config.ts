import { resolve } from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@runelight/vue/contract": resolve(import.meta.dirname, "../vue/src/contract.ts"),
      "@runelight/vue/preview": resolve(import.meta.dirname, "../vue/src/preview.ts"),
      "@runelight/core/contract": resolve(import.meta.dirname, "../core/src/contract.ts"),
      "@runelight/core/preview-protocol": resolve(import.meta.dirname, "../core/src/preview-protocol.ts"),
    },
  },
})
