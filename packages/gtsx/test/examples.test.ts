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
      await page.addInitScript(() => {
        const target = window as unknown as { __gtsxMessages: unknown[] }
        target.__gtsxMessages = []
        window.addEventListener("message", (event) => {
          const message = event.data as { type?: string }
          if (typeof message?.type === "string" && message.type.startsWith("gtsx:")) {
            target.__gtsxMessages.push(message)
          }
        })
      })
      await gotoWhenReady(
        page,
        `http://localhost:${port}/gtsx?entry=src/cases/stateful/DashboardShell.g.tsx&case=stagingReview&sessionId=studio-session-1&gcase=${encodeURIComponent("src/cases/stateful/NotificationBell.g.tsx#default:expanded")}`,
      )

      await expect.poll(() => page.getByText("Preview capture ready").count()).toBe(1)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const target = window as unknown as { __gtsxMessages?: Array<{ type?: string }> }
            return target.__gtsxMessages?.map((message) => message.type) ?? []
          }),
        )
        .toEqual(expect.arrayContaining(["gtsx:ready", "gtsx:tree", "gtsx:resize"]))

      const treeMessage = await page.evaluate(() => {
        const target = window as unknown as { __gtsxMessages?: Array<{ type?: string }> }
        return target.__gtsxMessages?.find((message) => message.type === "gtsx:tree")
      })
      expect(treeMessage).toMatchObject({
        protocolVersion: 1,
        sessionId: "studio-session-1",
        tree: [
          {
            coordinate: "src/cases/stateful/DashboardShell.g.tsx#default",
            rect: {
              height: expect.any(Number),
              width: expect.any(Number),
              x: expect.any(Number),
              y: expect.any(Number),
            },
            children: [
              {
                coordinate: "src/cases/stateful/NotificationBell.g.tsx#default",
                rect: {
                  height: expect.any(Number),
                  width: expect.any(Number),
                  x: expect.any(Number),
                  y: expect.any(Number),
                },
              },
            ],
          },
        ],
      })
      expect(
        (treeMessage as { tree: Array<{ rect?: { width: number; height: number } }> }).tree[0]?.rect?.width,
      ).toBeGreaterThan(0)

      const childBoundaryId = (treeMessage as { tree: Array<{ children?: Array<{ id: string }> }> }).tree[0]?.children?.[0]?.id
      if (!childBoundaryId) throw new Error("Missing child boundary id")

      await page.evaluate((boundaryId) => {
        window.postMessage(
          {
            type: "gtsx:request-values",
            protocolVersion: 1,
            sessionId: "studio-session-1",
            boundaryId,
          },
          "*",
        )
      }, childBoundaryId)
      await expect
        .poll(() =>
          page.evaluate(() => {
            const target = window as unknown as { __gtsxMessages?: Array<{ type?: string }> }
            return target.__gtsxMessages?.find((message) => message.type === "gtsx:values")
          }),
        )
        .toMatchObject({
          protocolVersion: 1,
          sessionId: "studio-session-1",
          values: {
            boundaryId: childBoundaryId,
            props: {
              type: "object",
              entries: expect.arrayContaining([
                {
                  key: "label",
                  value: { type: "string", value: "Agent inbox" },
                },
              ]),
            },
            scope: {
              type: "object",
              entries: expect.arrayContaining([
                {
                  key: "expanded",
                  value: { type: "boolean", value: true },
                },
              ]),
            },
          },
        })
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("serves the Studio shell from the examples Vite host", async () => {
    const port = "4325"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage()
      await gotoWhenReady(page, `http://localhost:${port}/gtsx/studio`)

      await expect.poll(() => page.getByText("GTSX Studio").count()).toBe(1)
      await expect
        .poll(() => page.locator('[data-gtsx-sidebar-preview-coordinate="src/cases/stateful/UserCard.g.tsx#default"]').count())
        .toBeGreaterThan(0)
      await expect.poll(() => page.locator('[data-gtsx-floating-viewport-controls]').count()).toBe(1)
      await expect
        .poll(() =>
          page.locator(
            '[data-gtsx-preview-src="/gtsx?entry=src%2Fcases%2Flanguage%2FPrimitiveProps.g.tsx%23default&case=neutralEmpty&chrome=0&sessionId=src%2Fcases%2Flanguage%2FPrimitiveProps.g.tsx%23default%3AneutralEmpty"]',
          ).count(),
        )
        .toBe(1)
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("keeps viewport tabs working after desktop and sidebar component switches", async () => {
    const port = "4328"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage()
      await gotoWhenReady(page, `http://localhost:${port}/gtsx/studio`)
      await expect.poll(() => page.locator('[data-gtsx-floating-viewport-controls]').count()).toBe(1)

      await page.locator('[data-gtsx-viewport-control="desktop"]').click()
      await expect.poll(() => canvasViewportPresets(page)).toEqual(["desktop"])
      await expect.poll(() => canvasIframeWidths(page)).toEqual([1280])

      await page.locator('[data-gtsx-sidebar-preview-coordinate="src/cases/stateful/UserCard.g.tsx#default"]').click()
      await expect.poll(() => canvasViewportPresets(page)).toEqual(["desktop"])
      await expect.poll(() => canvasIframeWidths(page)).toEqual([1280])
      await expect.poll(() => page.url()).toContain("canvasViewport=desktop")

      await page.locator('[data-gtsx-sidebar-preview-coordinate="src/cases/language/PrimitiveProps.g.tsx#default"]').click()
      await expect.poll(() => canvasViewportPresets(page)).toEqual(["desktop"])
      await expect.poll(() => canvasIframeWidths(page)).toEqual([1280])
      await page.locator('[data-gtsx-viewport-control="phone"]').click()

      await expect.poll(() => canvasViewportPresets(page)).toEqual(["phone"])
      await expect.poll(() => canvasIframeWidths(page)).toEqual([390])
      await expect.poll(() => page.url()).toContain("canvasViewport=phone")
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("shows case previews for the highlighted canvas component", async () => {
    const port = "4329"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage()
      await gotoWhenReady(page, `http://localhost:${port}/gtsx/studio`)
      await expect
        .poll(() => page.locator('[data-gtsx-card-select-coordinate="src/cases/language/PrimitiveProps.g.tsx#default"]').count())
        .toBe(1)

      await page.locator('[data-gtsx-card-select-coordinate="src/cases/language/PrimitiveProps.g.tsx#default"]').click()

      await expect
        .poll(() => page.locator('[data-gtsx-case-sidebar="src/cases/language/PrimitiveProps.g.tsx#default"]').count())
        .toBe(1)
      await expect.poll(() => casePreviewCardNames(page)).toEqual(["neutralEmpty", "positiveActive", "warningLongText"])
      await expect.poll(() => selectedCasePreviewCardNames(page)).toEqual(["neutralEmpty"])

      await page.locator('[data-gtsx-case-preview-card="positiveActive"]').click()

      await expect.poll(() => selectedCasePreviewCardNames(page)).toEqual(["positiveActive"])
      await expect
        .poll(() => canvasPreviewSources(page))
        .toContain(
          "/gtsx?entry=src%2Fcases%2Flanguage%2FPrimitiveProps.g.tsx%23default&case=positiveActive&chrome=0&sessionId=src%2Fcases%2Flanguage%2FPrimitiveProps.g.tsx%23default%3ApositiveActive",
        )
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("renders chrome-free previews without a shared preview background", async () => {
    const port = "4326"
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
        `http://localhost:${port}/gtsx?entry=${encodeURIComponent("src/cases/stateful/UserCard.g.tsx#default")}&case=ready&chrome=0`,
      )

      await expect.poll(() => page.getByText("Ada Lovelace").count()).toBe(1)
      expect(
        await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement)
          const body = getComputedStyle(document.body)
          const frame = document.querySelector<HTMLElement>(".gtsx-case-frame")
          const caseBody = document.querySelector<HTMLElement>(".gtsx-case-body")
          return {
            bodyBackground: body.backgroundColor,
            caseBodyPadding: caseBody ? getComputedStyle(caseBody).padding : null,
            frameBackground: frame ? getComputedStyle(frame).backgroundColor : null,
            frameBorder: frame ? getComputedStyle(frame).borderStyle : null,
            rootBackground: root.backgroundColor,
          }
        }),
      ).toEqual({
        bodyBackground: "rgba(0, 0, 0, 0)",
        caseBodyPadding: "0px",
        frameBackground: "rgba(0, 0, 0, 0)",
        frameBorder: "none",
        rootBackground: "rgba(0, 0, 0, 0)",
      })
    } finally {
      await browser?.close()
      server.kill()
    }
  }, 60_000)

  it("reports fresh boundary rects after preview viewport changes", async () => {
    const port = "4327"
    const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", port], {
      cwd: examplesRoot,
      shell: true,
      stdio: "ignore",
    })
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

    try {
      browser = await chromium.launch()
      const page = await browser.newPage({ viewport: { width: 420, height: 700 } })
      await page.addInitScript(() => {
        const target = window as unknown as { __gtsxMessages: unknown[] }
        target.__gtsxMessages = []
        window.addEventListener("message", (event) => {
          const message = event.data as { type?: string }
          if (typeof message?.type === "string" && message.type.startsWith("gtsx:")) {
            target.__gtsxMessages.push(message)
          }
        })
      })
      await gotoWhenReady(
        page,
        `http://localhost:${port}/gtsx?entry=src/cases/ui/NotificationCenter.g.tsx&case=mixedPriority&sessionId=studio-session-resize&chrome=0`,
      )

      await expect.poll(() => latestTreeRootRectWidth(page, "studio-session-resize")).toBeGreaterThan(0)
      const initialWidth = await latestTreeRootRectWidth(page, "studio-session-resize")
      await page.setViewportSize({ width: 1000, height: 700 })

      await expect.poll(() => treeMessageCount(page, "studio-session-resize")).toBeGreaterThan(1)
      await expect.poll(() => latestTreeRootRectWidth(page, "studio-session-resize")).toBeGreaterThan(initialWidth)
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

  it("renders a named component export selected by entry coordinate", async () => {
    const port = "4324"
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
        `http://localhost:${port}/gtsx?entry=${encodeURIComponent("src/cases/stateful/MultiExportPanel.g.tsx#NamedPanel")}&case=namedReady`,
      )

      await expect.poll(() => page.getByText("Named export: selected by file coordinate").count()).toBe(1)
      await expect.poll(() => page.getByText("Default export:").count()).toBe(0)
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

async function treeMessageCount(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  sessionId: string,
): Promise<number> {
  return page.evaluate((expectedSessionId) => {
    const target = window as unknown as { __gtsxMessages?: Array<{ sessionId?: string; type?: string }> }
    return target.__gtsxMessages?.filter((message) => message.type === "gtsx:tree" && message.sessionId === expectedSessionId).length ?? 0
  }, sessionId)
}

async function canvasViewportPresets(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-gtsx-preview-session-id][data-gtsx-preview-src]")].map(
      (element) => element.dataset.gtsxViewportPreset ?? "",
    ),
  )
}

async function casePreviewCardNames(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-gtsx-case-preview-card]")].map(
      (element) => element.dataset.gtsxCasePreviewCard ?? "",
    ),
  )
}

async function selectedCasePreviewCardNames(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-gtsx-case-preview-selected="true"]')].map(
      (element) => element.dataset.gtsxCasePreviewCard ?? "",
    ),
  )
}

async function canvasPreviewSources(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-gtsx-preview-session-id][data-gtsx-preview-src]")].map(
      (element) => element.dataset.gtsxPreviewSrc ?? "",
    ),
  )
}

async function canvasIframeWidths(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLIFrameElement>("[data-gtsx-preview-session-id][data-gtsx-preview-src] iframe")].map((frame) =>
      Math.round(frame.getBoundingClientRect().width),
    ),
  )
}

async function latestTreeRootRectWidth(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  sessionId: string,
): Promise<number> {
  return page.evaluate((expectedSessionId) => {
    const target = window as unknown as {
      __gtsxMessages?: Array<{
        sessionId?: string
        type?: string
        tree?: Array<{ rect?: { width?: number } }>
      }>
    }
    const treeMessages =
      target.__gtsxMessages?.filter((message) => message.type === "gtsx:tree" && message.sessionId === expectedSessionId) ?? []
    return treeMessages.at(-1)?.tree?.[0]?.rect?.width ?? 0
  }, sessionId)
}
