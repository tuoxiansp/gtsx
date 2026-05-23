import { describe, expect, it } from "vitest"

import { expandUrl } from "../src/cli.js"
import { runCLI } from "../src/cli.js"

describe("gtsx CLI", () => {
  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("gtsx check <entry.g.tsx[#export]|dir>")
    expect(result.stdout).toContain("gtsx serve <entry.g.tsx[#export]>")
    expect(result.stdout).toContain("--gcase <entry.g.tsx#export:case>")
    expect(result.stdout).toContain("gtsx capture <entry.g.tsx[#export]|dir>")
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
