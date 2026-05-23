import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type InitOptions = {
  cwd: string
  dryRun: boolean
}

export type InitResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const CONFIG_FILE = "gtsx.config.ts"
const INSTRUCTIONS_FILE = ".cursor/rules/gtsx.md"

export function initGTSX(options: InitOptions): InitResult {
  const changes = [
    `${existsSync(join(options.cwd, CONFIG_FILE)) ? "Would keep" : "Would create"} ${CONFIG_FILE}`,
    `${existsSync(join(options.cwd, INSTRUCTIONS_FILE)) ? "Would keep" : "Would create"} ${INSTRUCTIONS_FILE}`,
    "Would merge package scripts: gtsx:check, gtsx:serve, gtsx:capture",
  ]

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: `GTSX preview integration init plan:\n${changes.map((change) => `- ${change}`).join("\n")}\n`,
      stderr: "",
    }
  }

  writeIfMissing(join(options.cwd, CONFIG_FILE), configTemplate())
  writeIfMissing(join(options.cwd, INSTRUCTIONS_FILE), instructionsTemplate())
  mergePackageScripts(options.cwd)

  return {
    exitCode: 0,
    stdout: "Initialized GTSX preview integration.\n",
    stderr: "",
  }
}

function writeIfMissing(filePath: string, content: string) {
  if (existsSync(filePath)) return
  mkdirSync(join(filePath, ".."), { recursive: true })
  writeFileSync(filePath, content)
}

function mergePackageScripts(cwd: string) {
  const packagePath = join(cwd, "package.json")
  if (!existsSync(packagePath)) return

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>
  }
  packageJson.scripts = {
    ...(packageJson.scripts ?? {}),
    "gtsx:check": packageJson.scripts?.["gtsx:check"] ?? "gtsx check",
    "gtsx:serve": packageJson.scripts?.["gtsx:serve"] ?? "gtsx serve",
    "gtsx:capture": packageJson.scripts?.["gtsx:capture"] ?? "gtsx capture",
  }

  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function configTemplate(): string {
  return `import { defineGTSXConfig } from "gtsx"

export default defineGTSXConfig({
  preview: {
    serve: "npm run dev -- --port {port}",
    url: "http://localhost:{port}/gtsx?entry={entry}&case={case}",
    allUrl: "http://localhost:{port}/gtsx?entry={entry}",
  },
})
`
}

function instructionsTemplate(): string {
  return `# GTSX Project Instructions

- Keep preview cases close to production React components in .g.tsx files.
- Prefer hook-owned cases via createGTSXScope for non-pure components.
- Use component-level cases only for pure props components.
- Configure \`preview.serve\` to start this project's normal dev server.
- Configure \`preview.url\` to point at this project's GTSX preview route.
- Configure \`preview.allUrl\` to render all cases for one entry as a contact sheet.
- Do not put secrets, credentials, tokens, or customer data in GTSX cases.
`
}
