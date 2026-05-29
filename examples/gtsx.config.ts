import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    root: "src/cases",
    namespace: "gtsx-examples",
  },
  routes: {
    preview: "/gtsx",
    studio: "/gtsx/studio",
    manifest: "/gtsx/studio/manifest",
  },
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
})
