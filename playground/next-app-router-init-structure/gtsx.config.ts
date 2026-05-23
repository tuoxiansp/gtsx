import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "npm run dev -- --port {port}",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}",
  },
})
