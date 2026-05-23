import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
})
