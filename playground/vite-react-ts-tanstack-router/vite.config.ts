import react from "@vitejs/plugin-react"
import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import { defineConfig } from "vite"

import gtsxConfig from "./gtsx.config"

export default defineConfig({
  plugins: [gtsxViteReact({ config: gtsxConfig }), react()],
})
