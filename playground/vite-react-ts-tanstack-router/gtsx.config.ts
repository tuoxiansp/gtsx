import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "npm run dev -- --port {port}",
    url: "https://preview.test/vite-react?entry={entry}&case={case}&port={port}",
  },
})
