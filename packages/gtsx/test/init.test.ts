import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

const tempRoots: string[] = []

describe("gtsx init", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prints a minimal preview integration plan in dry-run mode", async () => {
    const root = createTempProject()

    const result = await runCLI(["init", "--dry-run"], {
      cwd: root,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Would create gtsx.config.ts")
    expect(result.stdout).toContain("Would create .cursor/rules/gtsx.md")
    expect(existsSync(join(root, "gtsx.config.ts"))).toBe(false)
  })

  it("creates preview config, local instructions, and package scripts", async () => {
    const root = createTempProject()

    const result = await runCLI(["init"], {
      cwd: root,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(root, "gtsx.config.ts"), "utf8")).toContain("preview")
    expect(readFileSync(join(root, ".cursor/rules/gtsx.md"), "utf8")).toContain(".g.tsx")
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts).toMatchObject({
      "gtsx:check": "gtsx check",
      "gtsx:serve": "gtsx serve",
      "gtsx:capture": "gtsx capture",
    })
  })
})

function createTempProject() {
  const root = mkdtempSync(join(tmpdir(), "gtsx-init-"))
  tempRoots.push(root)
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "fixture", scripts: {} }, null, 2)}\n`)
  return root
}
