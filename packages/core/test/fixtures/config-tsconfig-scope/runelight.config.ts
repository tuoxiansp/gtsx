import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    tsconfig: "tsconfig.app.json",
  },
  preview: {},
})
