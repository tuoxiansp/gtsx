import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src/app",
    entryRoot: "app/runelight",
    namespace: "runelight-website",
  },
  host: {
    command: "pnpm exec vite --host 127.0.0.1 --port {port}",
  },
})
