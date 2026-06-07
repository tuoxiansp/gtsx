import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src/frames",
    entryRoot: "app/runelight",
    namespace: "runelight-examples",
  },
  routes: {
    preview: "/runelight",
    studio: "/runelight/studio",
    manifest: "/runelight/studio/manifest",
  },
  preview: {
    serve: "pnpm exec vite --host 127.0.0.1 --port {port}",
    studioUrl: "http://localhost:{port}/runelight/studio",
    url: "http://localhost:{port}/runelight?entry={entry}&frame={frame}{frameOverrides}",
    allUrl: "http://localhost:{port}/runelight?entry={entry}{frameOverrides}",
  },
})
