import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  preview: {
    serve: "node scripts/record-command.mjs serve --port {port} {frameOverrides}",
    studioUrl: "http://localhost:{port}/runelight/studio",
    url: "https://preview.test/runelight?entry={entry}&frame={frame}&port={port}",
  },
})
