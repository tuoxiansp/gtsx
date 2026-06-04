import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/gtsx",
    namespace: "gtsx-studio",
  },
  routes: {
    preview: "/gtsx",
    studio: "/gtsx/studio",
    manifest: "/gtsx/studio/manifest",
  },
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&frame={frame}{gframe}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gframe}",
  },
})
