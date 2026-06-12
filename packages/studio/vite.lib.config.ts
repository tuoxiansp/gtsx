import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        manifest: resolve(root, "src/manifest.ts"),
        "manifest-server": resolve(root, "src/manifest-server.ts"),
        "static-app": resolve(root, "src/static-app.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "@runelight/core",
        "@runelight/core/config",
        "@runelight/core/contract",
        "@runelight/core/frame-grid-layout",
        "@runelight/core/project-index",
        "node:fs",
        "node:module",
        "node:path",
        "node:url",
      ],
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
})
