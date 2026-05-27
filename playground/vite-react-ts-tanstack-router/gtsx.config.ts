import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  project: {
    root: "src/routes",
    namespace: "vite-react-ts-tanstack-router",
  },
  preview: {
    serve: "npm run dev -- --port {port}",
    studioUrl: "http://localhost:{port}/gtsx/studio",
    url: "https://preview.test/vite-react?entry={entry}&case={case}{gcase}&port={port}",
  },
})
