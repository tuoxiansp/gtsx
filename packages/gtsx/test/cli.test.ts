import { describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

describe("gtsx CLI", () => {
  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("gtsx check <entry.g.tsx>")
    expect(result.stdout).toContain("gtsx serve <entry.g.tsx>")
    expect(result.stdout).toContain("gtsx capture <entry.g.tsx>")
  })
})
