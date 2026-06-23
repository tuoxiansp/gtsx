import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { chromium } from "playwright"
import { describe, expect, it } from "vitest"

import { runCLI } from "../../core/src/cli.js"
import { playwrightBrowserCaptureBackend } from "../src/browser-capture.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const examplesRoot = join(repositoryRoot, "examples/react-vite")
const snapshotsRoot = join(repositoryRoot, "snapshots/examples")

describe("examples Vite host", () => {
  it("checks and captures every renderable Runelight example", async () => {
    const check = await runCLI(["check", "src/frames"], {
      cwd: examplesRoot,
      stdout: "",
      stderr: "",
    })

    expect(check, `${check.stdout}\n${check.stderr}`).toMatchObject({ exitCode: 0 })
    expect(check.stdout).toContain("Runelight pure entry: src/frames/language/PrimitiveProps.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/frames/ui/NotificationCenter.g.tsx")
    expect(check.stdout).toContain("Runelight scope entry: src/frames/stateful/UserCard.g.tsx")
    expect(check.stdout).toContain("Runelight pure entry: src/frames/stateful/DashboardShell.g.tsx")
    expect(check.stdout).toContain("Runelight scope entry: src/frames/stateful/NotificationBell.g.tsx")

    rmSync(snapshotsRoot, { recursive: true, force: true })
    const capture = await runCLI(
      ["capture", "src/frames", "--port", "4320", "--out", "../../snapshots/examples"],
      {
        captureBackend: playwrightBrowserCaptureBackend,
        cwd: examplesRoot,
        stdout: "",
        stderr: "",
      },
    )

    expect(capture, `${capture.stdout}\n${capture.stderr}`).toMatchObject({ exitCode: 0 })
    for (const snapshot of [
      join(snapshotsRoot, "src/frames/language/PrimitiveProps.png"),
      join(snapshotsRoot, "src/frames/stateful/DashboardShell.png"),
      join(snapshotsRoot, "src/frames/stateful/NotificationBell.png"),
      join(snapshotsRoot, "src/frames/stateful/UserCard.png"),
      join(snapshotsRoot, "src/frames/ui/NotificationCenter.png"),
    ]) {
      expect(existsSync(snapshot)).toBe(true)
      expect(readFileSync(snapshot).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(statSync(snapshot).size).toBeGreaterThan(1_000)
    }

    const childOverride = await runCLI(
      [
        "capture",
        "src/frames/stateful/DashboardShell.g.tsx",
        "--frame",
        "stagingReview",
        "--frame-override",
        "src/frames/stateful/NotificationBell.g.tsx#default:expanded",
        "--port",
        "4321",
        "--out",
        "../../snapshots/examples/dashboard-expanded.png",
      ],
      {
        captureBackend: playwrightBrowserCaptureBackend,
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

  it("serves Studio and preview routes from the examples Vite host", async () => {
    const port = "4322"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
      cwd: examplesRoot,
      env: {
        ...process.env,
        RUNELIGHT_DEV: "1",
      },
      stdio: "ignore",
    })

    try {
      await fetchTextWhenReady(`http://127.0.0.1:${port}/runelight/studio`)

      const browser = await chromium.launch()
      try {
        const page = await browser.newPage()
        await page.goto(`http://127.0.0.1:${port}/runelight/studio`)
        await page
          .locator('[data-runelight-card-coordinate="src/frames/language/PrimitiveProps.g.tsx#default"]')
          .waitFor({ timeout: 10_000 })
        await page
          .locator('[data-runelight-card-coordinate="src/frames/stateful/DashboardShell.g.tsx#default"]')
          .waitFor({ timeout: 10_000 })

        const entry = encodeURIComponent("src/frames/language/PrimitiveProps.g.tsx#default")
        await page.goto(`http://127.0.0.1:${port}/runelight?entry=${entry}&frame=positiveActive&chrome=0`)
        await page.getByText("Active language fixture").waitFor({ timeout: 10_000 })
        expect(await page.getByText("42 events").count()).toBeGreaterThan(0)
      } finally {
        await browser.close()
      }
    } finally {
      server.kill()
    }
  }, 60_000)

  it("animates Studio drilldown column exit when toggling selection closed", async () => {
    const port = "4323"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port, "--strictPort"], {
      cwd: examplesRoot,
      env: {
        ...process.env,
        RUNELIGHT_DEV: "1",
      },
      stdio: "ignore",
    })

    try {
      await fetchTextWhenReady(`http://127.0.0.1:${port}/runelight/studio`)

      const browser = await chromium.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
        await page.emulateMedia({ reducedMotion: "no-preference" })

        const dashboardTile =
          '[data-runelight-card-coordinate="src/frames/stateful/DashboardShell.g.tsx#default"] [data-runelight-frame-tile="stagingReview"]'
        const childColumn =
          '[data-runelight-column-index="1"] [data-runelight-card-coordinate="src/frames/stateful/NotificationBell.g.tsx#default"]'
        const exitingColumn = '[data-runelight-drilldown-column-exit="true"][data-runelight-column-index="1"]'

        await page.goto(`http://127.0.0.1:${port}/runelight/studio`)
        await page.locator(`${dashboardTile} [data-runelight-frame-preview-frame-state="ready"]`).waitFor({
          timeout: 10_000,
        })

        await page.locator(dashboardTile).click()
        await page.locator(childColumn).waitFor({ timeout: 10_000 })

        await page.locator(dashboardTile).click()
        await page.locator(exitingColumn).waitFor({ state: "attached", timeout: 10_000 })

        const exitAnimation = await page.locator(exitingColumn).evaluate((column) => {
          const style = window.getComputedStyle(column)
          return {
            animationDuration: style.animationDuration,
            animationName: style.animationName,
            hasChildCard: Boolean(
              column.querySelector(
                '[data-runelight-card-coordinate="src/frames/stateful/NotificationBell.g.tsx#default"]',
              ),
            ),
          }
        })

        expect(exitAnimation).toMatchObject({
          animationDuration: "0.18s",
          animationName: "runelight-studio-layout-neutral-drilldown-column-exit",
          hasChildCard: true,
        })

        await page.locator(exitingColumn).waitFor({ state: "detached", timeout: 2_000 })
        expect(await page.locator('[data-runelight-column-index="1"]').count()).toBe(0)
      } finally {
        await browser.close()
      }
    } finally {
      server.kill()
    }
  }, 60_000)
})

async function fetchTextWhenReady(url: string): Promise<string> {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.text()
      lastError = new Error(`Unexpected ${response.status} from ${url}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}
