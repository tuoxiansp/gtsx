import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "node scripts/record-command.mjs serve --port {port}",
  },
})
