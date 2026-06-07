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

const CONFIG_FILE = "runelight.config.ts"
const INSTRUCTIONS_FILE = "AGENTS.md"

export function initRunelight(options: InitOptions): InitResult {
  const changes = [
    `${existsSync(join(options.cwd, CONFIG_FILE)) ? "Would keep" : "Would create"} ${CONFIG_FILE}`,
    `${existsSync(join(options.cwd, INSTRUCTIONS_FILE)) ? "Would keep" : "Would create"} ${INSTRUCTIONS_FILE}`,
    "Would merge package scripts: runelight:check, runelight:serve, runelight:capture",
  ]

  if (options.dryRun) {
    return {
      exitCode: 0,
      stdout: `Runelight preview integration init plan:\n${changes.map((change) => `- ${change}`).join("\n")}\n`,
      stderr: "",
    }
  }

  writeIfMissing(join(options.cwd, CONFIG_FILE), configTemplate())
  writeIfMissing(join(options.cwd, INSTRUCTIONS_FILE), instructionsTemplate())
  mergePackageScripts(options.cwd)

  return {
    exitCode: 0,
    stdout: "Initialized Runelight preview integration.\n",
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
    "runelight:check": packageJson.scripts?.["runelight:check"] ?? "runelight check",
    "runelight:serve": packageJson.scripts?.["runelight:serve"] ?? "runelight serve",
    "runelight:capture": packageJson.scripts?.["runelight:capture"] ?? "runelight capture",
  }

  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function configTemplate(): string {
  return `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
    namespace: "my-project",
  },
  routes: {
    preview: "/runelight",
    studio: "/runelight/studio",
    manifest: "/runelight/studio/manifest",
  },
  preview: {
    serve: "npm run dev -- --port {port}",
    studioUrl: "http://localhost:{port}/runelight/studio",
    url: "http://localhost:{port}/runelight?entry={entry}&frame={frame}{frameOverrides}",
    allUrl: "http://localhost:{port}/runelight?entry={entry}{frameOverrides}",
  },
  studio: {
    manifestCacheTtlMs: 1000,
  },
})
`
}

function instructionsTemplate(): string {
  return `# Runelight Project Instructions

- Keep preview frames close to production React components in .g.tsx files.
- Put main frames on component exports as Component.frames.
- Use createGScopeHook for stateful components and keep scope values in the component frames.
- Configure \`preview.serve\` to start this project's normal dev server.
- Configure \`preview.url\` to point at this project's Runelight preview route.
- Configure \`preview.allUrl\` to render all frames for one entry as a contact sheet.
- Configure \`project.sourceRoot\`, \`project.entryRoot\`, \`project.namespace\`, and \`routes\` as the single source of truth for Studio routes.
- Put design exploration frames in \`project.entryRoot/design\`.
- Do not put secrets, credentials, tokens, or customer data in Runelight frames.
`
}
