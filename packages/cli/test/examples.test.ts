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

type RecordedViewTransitionAnimation = {
  duration: unknown
  keyframes: Record<string, unknown>[]
  playState: string
  pseudoElement: string | null
}

type RecordedViewTransition = {
  animationsAtReady: RecordedViewTransitionAnimation[]
  error: string | null
  finished: boolean
  ready: boolean
}

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
        await page.addInitScript(() => {
          type ViewTransitionLike = {
            finished: Promise<void>
            ready: Promise<void>
          }
          type ViewTransitionDocument = {
            getAnimations: (options?: { subtree?: boolean }) => Animation[]
            startViewTransition?: (...args: unknown[]) => ViewTransitionLike
          }
          type ViewTransitionWindow = {
            __runelightViewTransitions: RecordedViewTransition[]
          }

          const trackedWindow = window as unknown as ViewTransitionWindow
          trackedWindow.__runelightViewTransitions = []

          const viewTransitionDocument = document as unknown as ViewTransitionDocument
          const original = viewTransitionDocument.startViewTransition?.bind(document)
          if (!original) return

          viewTransitionDocument.startViewTransition = (...args: unknown[]) => {
            const record: RecordedViewTransition = {
              animationsAtReady: [],
              error: null,
              finished: false,
              ready: false,
            }
            const transition = original(...args)
            trackedWindow.__runelightViewTransitions.push(record)
            transition.ready
              .then(() => {
                record.ready = true
                record.animationsAtReady = viewTransitionDocument.getAnimations({ subtree: true }).map((animation) => {
                  const effect = animation.effect as
                    | (AnimationEffect & {
                        getKeyframes?: () => Record<string, unknown>[]
                        pseudoElement?: string
                      })
                    | null
                  const timing = effect?.getTiming()
                  return {
                    duration: timing?.duration ?? 0,
                    keyframes: effect?.getKeyframes?.() ?? [],
                    playState: animation.playState,
                    pseudoElement: effect?.pseudoElement ?? null,
                  }
                })
              })
              .catch((error: unknown) => {
                record.error = String(error)
              })
            transition.finished
              .then(() => {
                record.finished = true
              })
              .catch((error: unknown) => {
                record.error = String(error)
              })
            return transition
          }
        })

        const dashboardTile =
          '[data-runelight-card-coordinate="src/frames/stateful/DashboardShell.g.tsx#default"] [data-runelight-frame-tile="stagingReview"]'

        await page.goto(`http://127.0.0.1:${port}/runelight/studio`)
        expect(
          await page.evaluate(() => typeof (document as Document & { startViewTransition?: unknown }).startViewTransition),
        ).toBe("function")
        await page.locator(`${dashboardTile} [data-runelight-frame-preview-frame-state="ready"]`).waitFor({
          timeout: 10_000,
        })

        await page.locator(dashboardTile).click()
        await page
          .locator(
            '[data-runelight-column-index="1"] [data-runelight-card-coordinate="src/frames/stateful/NotificationBell.g.tsx#default"]',
          )
          .waitFor({ timeout: 10_000 })

        const transitionCountBeforeCollapse = await page.evaluate(
          () =>
            (window as unknown as { __runelightViewTransitions: RecordedViewTransition[] }).__runelightViewTransitions
              .length,
        )

        await page.locator(dashboardTile).click()
        await page.waitForFunction(
          (count) =>
            (window as unknown as { __runelightViewTransitions: RecordedViewTransition[] }).__runelightViewTransitions
              .length > count,
          transitionCountBeforeCollapse,
          { timeout: 10_000 },
        )
        await page.waitForFunction(
          (count) =>
            (window as unknown as { __runelightViewTransitions: RecordedViewTransition[] }).__runelightViewTransitions
              .slice(count)
              .some((transition) => transition.ready || transition.error),
          transitionCountBeforeCollapse,
          { timeout: 10_000 },
        )

        const result = await page.evaluate((count) => {
          const transitions = (window as unknown as { __runelightViewTransitions: RecordedViewTransition[] })
            .__runelightViewTransitions
          const collapseTransitions = transitions.slice(count)
          return {
            columnsAfterCollapse: [...document.querySelectorAll("[data-runelight-column-index]")].map((column) =>
              column.getAttribute("data-runelight-column-index"),
            ),
            collapseTransitions,
          }
        }, transitionCountBeforeCollapse)

        expect(result.columnsAfterCollapse).toEqual(["0"])
        expect(result.collapseTransitions.some((transition) => transition.error)).toBe(false)
        expect(
          result.collapseTransitions.some((transition) =>
            transition.animationsAtReady.some((animation) => isStudioDrilldownColumnExitAnimation(animation)),
          ),
        ).toBe(true)
        expect(
          result.collapseTransitions.some((transition) =>
            transition.animationsAtReady.some((animation) => isRootViewTransitionAnimation(animation)),
          ),
        ).toBe(false)
      } finally {
        await browser.close()
      }
    } finally {
      server.kill()
    }
  }, 60_000)
})

function isStudioDrilldownColumnExitAnimation(animation: RecordedViewTransitionAnimation): boolean {
  if (!animation.pseudoElement?.startsWith("::view-transition-old(")) return false
  if (Number(animation.duration) !== 180) return false
  return (
    animation.keyframes.some((keyframe) => keyframe.opacity === "1" && keyframe.translate === "0px") &&
    animation.keyframes.some((keyframe) => keyframe.opacity === "0" && keyframe.translate === "-12px")
  )
}

function isRootViewTransitionAnimation(animation: RecordedViewTransitionAnimation): boolean {
  return animation.pseudoElement?.endsWith("(root)") === true && Number(animation.duration) > 0
}

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
