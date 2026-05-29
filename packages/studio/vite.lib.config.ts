import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig, normalizePath, type Plugin } from "vite"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    gtsxViteReact({ root, projectRoot: "src" }),
    react(),
    preserveClientEntrypointDirective(),
  ],
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        index: resolve(root, "src/index.ts"),
        client: resolve(root, "src/client-entry.ts"),
        manifest: resolve(root, "src/manifest.ts"),
        "manifest-server": resolve(root, "src/manifest-server.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "@gtsx/core",
        "@gtsx/core/config",
        "@gtsx/core/config-model",
        "@gtsx/core/project-index",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
      ],
      output: {
        assetFileNames: "assets/[name][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
})

function preserveClientEntrypointDirective(): Plugin {
  return {
    name: "gtsx-studio-preserve-client-entrypoint-directive",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue
        if (!chunk.facadeModuleId || !normalizePath(chunk.facadeModuleId).endsWith("/src/client-entry.ts")) continue
        if (!chunk.code.startsWith("\"use client\"")) {
          chunk.code = `"use client";\n${chunk.code}`
        }
      }
    },
  }
}
