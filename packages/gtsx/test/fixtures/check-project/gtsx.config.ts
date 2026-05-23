import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  adapter: "script",
  scripts: {
    serve:
      "node scripts/record-command.mjs serve --entry {entry} --case {case} --port {port}",
    capture:
      "node scripts/record-command.mjs capture --entry {entry} --case {case} --viewport {viewport} --out {out}",
    strip: "node scripts/record-command.mjs strip --check {check}",
  },
})
