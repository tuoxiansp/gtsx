import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "playwright"
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

  it("renders a nested stateful component selected by gcase in the browser", async () => {
    const port = "4322"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage()
      await gotoWhenReady(
        page,
        `http://localhost:${port}/gtsx?entry=src/cases/stateful/DashboardShell.g.tsx&case=stagingReview&gcase=${encodeURIComponent("src/cases/stateful/NotificationBell.g.tsx#default:expanded")}`,
      )

      await expect.poll(() => page.getByText("Preview capture ready").count()).toBe(1)
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("renders the selected root stateful component case in the browser", async () => {
    const port = "4323"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage()
      await gotoWhenReady(
        page,
        `http://localhost:${port}/gtsx?entry=src/cases/stateful/UserCard.g.tsx&case=ready`,
      )

      await expect.poll(() => page.getByText("Ada Lovelace").count()).toBe(1)
      await expect.poll(() => page.getByText("Loading user...").count()).toBe(0)
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)
})

async function gotoWhenReady(page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>, url: string) {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 5_000 })
      return
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for preview URL: ${url}`)
}
