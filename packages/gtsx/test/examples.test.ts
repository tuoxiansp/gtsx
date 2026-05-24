import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const examplesRoot = join(repositoryRoot, "examples")
const snapshotsRoot = join(repositoryRoot, "snapshots/examples")

describe("examples Vite host", () => {
  it("checks and captures every renderable GTSX example", async () => {
    const check = await runCLI(["check", "src/cases"], {
      cwd: examplesRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("GTSX pure entry: src/cases/language/PrimitiveProps.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/cases/ui/NotificationCenter.g.tsx")
    expect(check.stdout).toContain("GTSX scope entry: src/cases/stateful/UserCard.g.tsx")
    expect(check.stdout).toContain("GTSX pure entry: src/cases/stateful/DashboardShell.g.tsx")
    expect(check.stdout).toContain("GTSX scope entry: src/cases/stateful/NotificationBell.g.tsx")

    rmSync(snapshotsRoot, { recursive: true, force: true })
    const capture = await runCLI(
      ["capture", "src/cases", "--all", "--port", "4320", "--out", "../snapshots/examples"],
      {
        cwd: examplesRoot,
        stdout: "",
        stderr: "",
      },
    )

    expect(capture, `${capture.stdout}\n${capture.stderr}`).toMatchObject({ exitCode: 0 })
    for (const snapshot of [
      join(snapshotsRoot, "src/cases/language/PrimitiveProps.png"),
      join(snapshotsRoot, "src/cases/stateful/DashboardShell.png"),
      join(snapshotsRoot, "src/cases/stateful/NotificationBell.png"),
      join(snapshotsRoot, "src/cases/stateful/UserCard.png"),
      join(snapshotsRoot, "src/cases/ui/NotificationCenter.png"),
    ]) {
      expect(existsSync(snapshot)).toBe(true)
      expect(readFileSync(snapshot).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(statSync(snapshot).size).toBeGreaterThan(1_000)
    }

    const childOverride = await runCLI(
      [
        "capture",
        "src/cases/stateful/DashboardShell.g.tsx",
        "--case",
        "stagingReview",
        "--gcase",
        "src/cases/stateful/NotificationBell.g.tsx#default:expanded",
        "--port",
        "4321",
        "--out",
        "../snapshots/examples/dashboard-expanded.png",
      ],
      {
        cwd: examplesRoot,
        stdout: "",
        stderr: "",
      },
    )

    const childOverrideSnapshot = join(snapshotsRoot, "dashboard-expanded.png")
    expect(childOverride, `${childOverride.stdout}\n${childOverride.stderr}`).toMatchObject({ exitCode: 0 })
    expect(existsSync(childOverrideSnapshot)).toBe(true)
    expect(readFileSync(childOverrideSnapshot).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(statSync(childOverrideSnapshot).size).toBeGreaterThan(1_000)
  }, 60_000)
})
