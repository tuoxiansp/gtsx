import { readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

const fixtureRoot = join(import.meta.dirname, "fixtures/check-project")
const logFile = join(fixtureRoot, "gtsx-command-log.jsonl")

describe("Script adapter", () => {
  beforeEach(() => {
    rmSync(logFile, { force: true })
  })

  afterEach(() => {
    rmSync(logFile, { force: true })
  })

  it("serves an entry by checking the contract before invoking the configured command", async () => {
    const result = await runCLI(["serve", "src/UserCard.g.tsx", "--case", "ready", "--port", "4300"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(readLog()).toEqual([
      {
        action: "serve",
        args: ["--entry", "src/UserCard.g.tsx", "--case", "ready", "--port", "4300"],
      },
    ])
  })

  it("captures all statically enumerable cases through the configured command", async () => {
    const result = await runCLI(
      ["capture", "src/UserCard.g.tsx", "--all", "--viewport", "1440x900", "--out", "shots"],
      { cwd: fixtureRoot, stdout: "", stderr: "" },
    )

    expect(result.exitCode).toBe(0)
    expect(readLog()).toEqual([
      {
        action: "capture",
        args: [
          "--entry",
          "src/UserCard.g.tsx",
          "--case",
          "loading",
          "--viewport",
          "1440x900",
          "--out",
          "shots/loading.png",
        ],
      },
      {
        action: "capture",
        args: [
          "--entry",
          "src/UserCard.g.tsx",
          "--case",
          "ready",
          "--viewport",
          "1440x900",
          "--out",
          "shots/ready.png",
        ],
      },
    ])
  })

  it("delegates strip checks to the configured command", async () => {
    const result = await runCLI(["strip", "--check"], {
      cwd: fixtureRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(readLog()).toEqual([
      {
        action: "strip",
        args: ["--check", "true"],
      },
    ])
  })
})

function readLog() {
  return readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
}
