import { defineRunelightConfig } from "@runelight/core/define-config"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "src/app/runelight",
    namespace: "runelight-examples-vue-vite",
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
