import { readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { expandUrl } from "../src/cli.js"
import { runCLI } from "../src/cli.js"

describe("gtsx CLI", () => {
  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("gtsx check <entry.g.tsx[#export]|dir>")
    expect(result.stdout).toContain("gtsx serve [--port <port>]")
    expect(result.stdout).toContain("--gcase <entry.g.tsx#export:case>")
    expect(result.stdout).toContain("gtsx capture <entry.g.tsx[#export]|dir>")
  })

  it("serves the project Studio URL without requiring a component entry", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-project")
    const logFile = join(cwd, "gtsx-command-log.jsonl")
    rmSync(logFile, { force: true })

    const result = await runCLI(["serve", "--port", "4555"], { cwd, stdout: "", stderr: "" })

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Studio: http://localhost:4555/gtsx/studio\n",
      stderr: "",
    })
    expect(readFileSync(logFile, "utf8").trim()).toBe(
      JSON.stringify({ action: "serve", args: ["--port", "4555"] }),
    )
  })

  it("reports missing Studio route integration for project-level serve", async () => {
    const result = await runCLI(["serve"], {
      cwd: join(import.meta.dirname, "fixtures/missing-studio-url"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-studio-url")
    expect(result.stdout).toContain("Add preview.studioUrl")
  })

  it("expands child case overrides as query parameters", () => {
    expect(
      expandUrl("http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}", {
        entry: "src/cases/stateful/DashboardShell.g.tsx",
        caseName: "stagingReview",
        port: "4321",
        gcases: ["src/cases/stateful/NotificationBell.g.tsx#default:expanded"],
      }),
    ).toBe(
      "http://localhost:4321/gtsx?entry=src%2Fcases%2Fstateful%2FDashboardShell.g.tsx&case=stagingReview&gcase=src%2Fcases%2Fstateful%2FNotificationBell.g.tsx%23default%3Aexpanded",
    )
  })
})
