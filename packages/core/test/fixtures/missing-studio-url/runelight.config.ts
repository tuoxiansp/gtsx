import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  preview: {
    serve: "node -e \"process.stdout.write('server started')\"",
    url: "http://localhost:{port}/runelight?entry={entry}&frame={frame}",
  },
})
