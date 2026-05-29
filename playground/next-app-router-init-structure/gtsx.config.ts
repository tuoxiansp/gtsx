import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    root: "components",
    namespace: "next-app-router-init-structure",
  },
  routes: {
    preview: "/gtsx",
    studio: "/gtsx/studio",
    manifest: "/gtsx/studio/manifest",
  },
  preview: {
    serve: "npm run dev -- --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}{gcase}",
  },
})
