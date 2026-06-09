import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  host: {
    command: "node scripts/next-conflict.mjs",
  },
})
