import { defineRunelightConfig } from "@runelight/core/define-config"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
    namespace: "runelight-examples-vue-vite",
  },
  host: {
    command: "pnpm exec vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
