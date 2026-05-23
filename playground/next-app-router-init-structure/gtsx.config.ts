import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  adapter: "script",
  scripts: {
    serve:
      "node scripts/playground-adapter.mjs serve --entry {entry} --case {case} --port {port}",
    capture:
      "node scripts/playground-adapter.mjs capture --entry {entry} --case {case} --viewport {viewport} --out {out}",
    strip: "node scripts/playground-adapter.mjs strip --check {check}",
  },
})
