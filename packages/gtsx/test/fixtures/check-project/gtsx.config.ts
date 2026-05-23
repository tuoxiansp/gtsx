import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "node scripts/record-command.mjs serve --port {port}",
    url: "https://preview.test/gtsx?entry={entry}&case={case}&port={port}",
  },
})
