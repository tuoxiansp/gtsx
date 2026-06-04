import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/gtsx",
    tsconfig: "tsconfig.app.json",
  },
  preview: {},
})
