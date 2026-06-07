import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { runelightViteReact } from "../adapter-vite-react/src/index"
import react from "@vitejs/plugin-react"
import { defineConfig, normalizePath, type Plugin } from "vite"

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    runelightViteReact({ root, sourceRoot: "src" }),
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
        "static-app": resolve(root, "src/static-app.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        "@runelight/core",
        "@runelight/core/config",
        "@runelight/core/config-model",
        "@runelight/core/project-index",
        "node:fs",
        "node:path",
        "node:url",
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
    name: "runelight-studio-preserve-client-entrypoint-directive",
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
