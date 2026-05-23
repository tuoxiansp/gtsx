import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const logFile = join(fixtureRoot, "gtsx-command-log.jsonl")

describe("GTSX preview commands", () => {
  beforeEach(() => {
    rmSync(logFile, { force: true })
  })

  afterEach(() => {
    rmSync(logFile, { force: true })
    rmSync(join(fixtureRoot, "shots"), { recursive: true, force: true })
  })

  it("serves an entry by checking the contract before invoking the configured preview command", async () => {
    const result = await runCLI(["serve", "src/UserCard.g.tsx", "--case", "ready", "--port", "4300"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(readLog()).toEqual([
      {
        action: "serve",
        args: ["--port", "4300"],
      },
    ])
  })

  it("passes child component case overrides to the configured preview command", async () => {
    const result = await runCLI(
      [
        "serve",
        "src/UserCard.g.tsx",
        "--case",
        "ready",
        "--gcase",
        "src/Child.g.tsx#Child:open",
        "--gcase",
        "src/Menu.g.tsx#default:closed",
        "--port",
        "4300",
      ],
      {
        cwd: fixtureRoot,
        stdout: "",
        stderr: "",
      },
    )

    expect(result.exitCode).toBe(0)
    expect(readLog()).toEqual([
      {
        action: "serve",
        args: [
          "--port",
          "4300",
          "--gcase",
          "src/Child.g.tsx#Child:open",
          "--gcase",
          "src/Menu.g.tsx#default:closed",
        ],
      },
    ])
  })

  it("does not require a strip command while strip integration is not configured", async () => {
    const result = await runCLI(["strip", "--check"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("missing-strip-script")
    expect(existsSync(logFile)).toBe(false)
  })

  it("requires an all-cases preview URL before capturing a contact sheet", async () => {
    const result = await runCLI(["capture", "src/Badge.g.tsx", "--all"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-preview-all-url")
    expect(existsSync(logFile)).toBe(false)
  })
})

function readLog() {
  return readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
}
