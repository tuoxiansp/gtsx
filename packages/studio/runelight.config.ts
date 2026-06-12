import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    namespace: "runelight-studio",
  },
  host: {
    command: "pnpm exec vite --host 127.0.0.1 --port {port} --strictPort",
  },
})
