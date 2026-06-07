import { runelightViteReact } from "@runelight/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import runelightConfig from "./runelight.config"

export default defineConfig({
  optimizeDeps: {
    exclude: ["@runelight/core"],
  },
  plugins: [runelightViteReact({ config: runelightConfig }), react()],
})
