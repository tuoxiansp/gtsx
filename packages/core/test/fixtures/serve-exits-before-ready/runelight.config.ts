import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "node -e \"process.exit(0)\"",
  },
})
