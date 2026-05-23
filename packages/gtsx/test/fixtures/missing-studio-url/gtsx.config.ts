import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "node -e \"process.stdout.write('server started')\"",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}",
  },
})
