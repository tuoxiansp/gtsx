import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/vue/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
    namespace: "runelight-examples-vue-vite",
  },
  host: {
    command: "pnpm exec vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
