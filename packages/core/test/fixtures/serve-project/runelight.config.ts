import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "node scripts/serve-studio.mjs --port {port} {frameOverrides}",
  },
})
