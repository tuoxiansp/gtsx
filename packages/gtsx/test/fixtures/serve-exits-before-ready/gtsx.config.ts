import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "node -e \"process.exit(0)\"",
    studioUrl: "http://localhost:{port}/gtsx/studio",
  },
})
