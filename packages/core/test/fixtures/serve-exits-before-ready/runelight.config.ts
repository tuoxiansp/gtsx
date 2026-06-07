import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  preview: {
    serve: "node -e \"process.exit(0)\"",
    studioUrl: "http://localhost:{port}/runelight/studio",
  },
})
