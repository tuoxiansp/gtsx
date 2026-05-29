import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  preview: {
    serve: "npm run start -- --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "https://preview.test/tanstack-start?entry={entry}&case={case}&port={port}",
  },
})
