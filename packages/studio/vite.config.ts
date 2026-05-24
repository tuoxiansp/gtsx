import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  optimizeDeps: {
    exclude: ["gtsx"],
  },
  plugins: [gtsxViteReact(), react()],
})
