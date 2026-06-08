import { runelightViteReact } from "@runelight/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import runelightConfig from "./runelight.config"

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@runelight/core"],
  },
  plugins: [runelightViteReact({ config: runelightConfig }), react()],
})
