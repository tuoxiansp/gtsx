import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    tsconfig: "tsconfig.app.json",
  },
  host: {
    command: "node -e \"process.stdout.write('server started')\"",
  },
})
