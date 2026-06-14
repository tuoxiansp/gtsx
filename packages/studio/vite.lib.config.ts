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
        "manifest-server-worker": resolve(root, "src/manifest-server-worker.ts"),
        "static-app": resolve(root, "src/static-app.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "@runelight/changes",
        "@runelight/core",
        "@runelight/core/config",
        "@runelight/core/contract",
        "@runelight/core/frame-grid-layout",
        "@runelight/core/project-index",
        "node:child_process",
        "node:crypto",
        "node:fs",
        "node:module",
        "node:path",
        "node:url",
        "node:worker_threads",
      ],
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
})
