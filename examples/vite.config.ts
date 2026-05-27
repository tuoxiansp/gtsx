import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import gtsxConfig from "./gtsx.config"

export default defineConfig({
  optimizeDeps: {
    exclude: ["gtsx"],
  },
  plugins: [gtsxViteReact({ config: gtsxConfig }), react()],
})
