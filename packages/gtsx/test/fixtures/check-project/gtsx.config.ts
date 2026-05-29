import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  preview: {
    serve: "node scripts/record-command.mjs serve --port {port} {gcases}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "https://preview.test/gtsx?entry={entry}&case={case}&port={port}",
  },
})
