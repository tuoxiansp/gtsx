import { runelightViteReact } from "@runelight/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  optimizeDeps: {
    exclude: ["@runelight/core", "@runelight/react"],
  },
  plugins: [runelightViteReact(), react()],
})
