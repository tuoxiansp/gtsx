import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

import { runelightViteVue } from "@runelight/adapter-vite-vue"

export default defineConfig({
  plugins: [runelightViteVue(), vue()],
})
