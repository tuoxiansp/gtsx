import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  project: {
    root: "src",
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
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
})
