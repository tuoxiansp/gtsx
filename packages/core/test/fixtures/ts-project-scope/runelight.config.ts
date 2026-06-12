import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: ".",
    entryRoot: "src/app/runelight",
    tsconfig: "tsconfig.json",
  },
})
