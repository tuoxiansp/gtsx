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
  `${JSON.stringify({ framework: "next-app-router", issue: "vercel/next.js#59845", action, values }, null, 2)}\n`,
)

if (action === "capture" && values.out) {
  writeSnapshotPng(join(process.cwd(), values.out), [
    "framework: next app router",
    "issue: vercel/next.js#59845",
    `case: ${values.case}`,
    `entry: ${values.entry}`,
  ])
}

process.stdout.write(`next-app-router ${action} ${values.case ?? ""}\n`)
