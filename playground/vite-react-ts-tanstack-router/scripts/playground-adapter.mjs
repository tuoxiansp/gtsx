import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { writeSnapshotPng } from "../../scripts/write-snapshot.mjs"

const [action, ...args] = process.argv.slice(2)
const values = Object.fromEntries(
  args.flatMap((arg, index) => (arg.startsWith("--") ? [[arg.slice(2), args[index + 1] ?? ""]] : [])),
)

const artifactDir = join(process.cwd(), ".gtsx-artifacts")
mkdirSync(artifactDir, { recursive: true })
writeFileSync(
  join(artifactDir, `${action}.json`),
  `${JSON.stringify({ framework: "vite-react-ts", issue: "vitejs/vite#21614", action, values }, null, 2)}\n`,
)

if (action === "capture" && values.out) {
  writeSnapshotPng(join(process.cwd(), values.out), [
    "framework: vite react ts",
    "issue: vitejs/vite#21614",
    `case: ${values.case}`,
    `entry: ${values.entry}`,
  ])
}

process.stdout.write(`vite-react-ts ${action} ${values.case ?? ""}\n`)
