import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "node scripts/parent.mjs --port {port}",
  },
})
