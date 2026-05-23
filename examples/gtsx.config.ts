import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}",
  },
})
