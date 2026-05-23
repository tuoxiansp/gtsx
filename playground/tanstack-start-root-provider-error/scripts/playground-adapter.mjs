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
  `${JSON.stringify({ framework: "tanstack-start", issue: "TanStack/router#7133", action, values }, null, 2)}\n`,
)

if (action === "capture" && values.out) {
  writeSnapshotPng(join(process.cwd(), values.out), [
    "framework: tanstack start",
    "issue: tanstack/router#7133",
    `case: ${values.case}`,
    `entry: ${values.entry}`,
  ])
}

process.stdout.write(`tanstack-start ${action} ${values.case ?? ""}\n`)
