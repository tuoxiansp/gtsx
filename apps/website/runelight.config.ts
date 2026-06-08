import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src/app",
    entryRoot: "app/runelight",
    namespace: "runelight-website",
  },
  routes: {
    preview: "/runelight",
    studio: "/runelight/studio",
    manifest: "/runelight/studio/manifest",
  },
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    studioUrl: "http://localhost:{port}/runelight/studio",
    url: "http://localhost:{port}/runelight?entry={entry}&frame={frame}&chrome=0{frameOverrides}",
    allUrl: "http://localhost:{port}/runelight?entry={entry}&chrome=0{frameOverrides}",
  },
})
