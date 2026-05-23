import react from "@vitejs/plugin-react"
import { gtsxViteReact } from "@gtsx/adapter-vite-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [gtsxViteReact({ projectRoot: "src" }), react()],
})
