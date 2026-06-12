import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    tsconfig: "tsconfig.app.json",
  },
  host: {
    command: "node -e \"process.stdout.write('server started')\" {port}",
  },
})
