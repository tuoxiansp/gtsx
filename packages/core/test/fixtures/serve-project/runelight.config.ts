import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  preview: {
    serve: "node scripts/serve-studio.mjs --port {port} {frameOverrides}",
    studioUrl: "http://localhost:{port}/runelight/studio",
    url: "https://preview.test/runelight?entry={entry}&frame={frame}&port={port}",
  },
})
