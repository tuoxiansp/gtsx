import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const cwd = join(root, "..")
const capturesRoot = join(cwd, "public/captures")
const casesDir = join(capturesRoot, "cases")
const siteDir = join(capturesRoot, "site")
const port = 5199

mkdirSync(casesDir, { recursive: true })
mkdirSync(siteDir, { recursive: true })

const contactSheetCaptures = []
const singleFrameCaptures = []

function runContactSheetCapture(capture) {
  execFileSync(
    "pnpm",
    ["exec", "runelight", "capture", capture.entry, "--out", capture.out, "--viewport", capture.viewport, "--port", String(port)],
    { cwd, stdio: "inherit" },
  )
}

function runSingleFrameCapture(capture) {
  execFileSync(
    "pnpm",
    [
      "exec",
      "runelight",
      "capture",
      capture.entry,
      "--frame",
      capture.frame,
      "--out",
      capture.out,
      "--viewport",
      capture.viewport,
      "--port",
      String(port),
    ],
    { cwd, stdio: "inherit" },
  )
}

for (const capture of contactSheetCaptures) {
  console.log(`Capturing ${capture.out}...`)
  runContactSheetCapture(capture)
}

for (const capture of singleFrameCaptures) {
  console.log(`Capturing ${capture.out}...`)
  runSingleFrameCapture(capture)
}

console.log("Capture complete.")
