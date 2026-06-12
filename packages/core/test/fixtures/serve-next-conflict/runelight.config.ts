import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
  host: {
    command: "node scripts/next-conflict.mjs {port}",
  },
})
