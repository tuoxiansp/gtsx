import { defineGTSXConfig } from "@gtsx/core"

export default defineGTSXConfig({
  project: {
    root: "src/routes",
    namespace: "vite-react-ts-tanstack-router",
  },
  preview: {
    serve: "npm run dev -- --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "https://preview.test/vite-react?entry={entry}&frame={frame}{gframe}&port={port}",
  },
})
