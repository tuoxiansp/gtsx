import { runelightViteReact } from "../adapter-vite-react/src/index"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import runelightConfig from "./runelight.config"

export default defineConfig({
  base: "/runelight/studio/",
  optimizeDeps: {
    exclude: ["@runelight/core"],
  },
  plugins: [runelightViteReact({ config: runelightConfig }), react()],
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
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
