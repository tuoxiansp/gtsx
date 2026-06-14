import { resolve } from "node:path"

import { runelightViteReact } from "../adapter-vite-react/src/index"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import runelightConfig from "./runelight.config"

export default defineConfig({
  base: "/runelight/studio/",
  optimizeDeps: {
    exclude: ["@runelight/changes", "@runelight/core", "@runelight/react"],
  },
  resolve: {
    alias: {
      "@runelight/changes": resolve(import.meta.dirname, "../changes/src/index.ts"),
      "@runelight/react/contract": resolve(import.meta.dirname, "../react/src/contract.ts"),
    },
  },
  plugins: [runelightViteReact({ config: runelightConfig }), react()],
  build: {
    copyPublicDir: false,
    emptyOutDir: true,
    outDir: "dist/studio",
    rollupOptions: {
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
})
