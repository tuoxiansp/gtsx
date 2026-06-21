import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { chromium } from "playwright"
import type { RunelightCaptureBackend, RunelightCaptureOptions } from "@runelight/core/cli"

const previewCaptureBoundsSelector = "[data-runelight-preview-capture-bounds]"
const previewFrameGroupSelector = "[data-runelight-preview-frame-group]"
const previewCaptureCanvasPadding = 32

export const playwrightBrowserCaptureBackend: RunelightCaptureBackend = {
  capturePreviewPage,
}

export async function capturePreviewPage(options: RunelightCaptureOptions): Promise<void> {
  const originalCwd = process.cwd()
  process.chdir(options.cwd)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: parseViewport(options.viewport) })
    await gotoWhenReady(page, options.url)
    await waitForPreviewCaptureLayout(page)
    const clip = await previewCaptureClip(page)
    const outputPath = resolve(options.cwd, options.out)
    mkdirSync(dirname(outputPath), { recursive: true })
    await page.screenshot({ path: outputPath, omitBackground: true, ...(clip ? { clip } : { fullPage: true }) })
  } finally {
    try {
      await browser?.close()
    } finally {
      process.chdir(originalCwd)
    }
  }
}

function parseViewport(viewport: string): { width: number; height: number } {
  const [width, height] = viewport.split("x").map((value) => Number.parseInt(value, 10))
  if (!width || !height) {
    throw new Error(`Invalid viewport: ${viewport}`)
  }
  return { width, height }
}

async function waitForPreviewCaptureLayout(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
) {
  try {
    await page.waitForFunction(
      (selector) => {
        const frameGroup = document.querySelector(selector)
        return !frameGroup || frameGroup.getAttribute("data-runelight-preview-frame-group-measured") === "true"
      },
      previewFrameGroupSelector,
      { timeout: 5_000 },
    )
  } catch {
    // Capture should still work for hosts that do not expose Runelight contact-sheet layout markers.
  }
}

async function previewCaptureClip(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<{ x: number; y: number; width: number; height: number } | undefined> {
  const bounds = await previewCaptureBoundsBox(page)
  if (!bounds) return undefined

  const pageSize = await page.evaluate(() => ({
    height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
    width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
  }))
  const x = Math.max(0, Math.floor(bounds.x - previewCaptureCanvasPadding))
  const y = Math.max(0, Math.floor(bounds.y - previewCaptureCanvasPadding))
  const right = Math.min(pageSize.width, Math.ceil(bounds.x + bounds.width + previewCaptureCanvasPadding))
  const bottom = Math.min(pageSize.height, Math.ceil(bounds.y + bounds.height + previewCaptureCanvasPadding))

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

async function previewCaptureBoundsBox(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector)
    if (!(element instanceof HTMLElement)) return null

    if (element.hasAttribute("data-runelight-preview-frame")) {
      const descendantRects = [...element.querySelectorAll<HTMLElement>("*")]
        .filter((node) => {
          const style = window.getComputedStyle(node)
          if (style.display === "contents" || style.visibility === "hidden") return false
          const rect = node.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        .map((node) => node.getBoundingClientRect())

      if (descendantRects.length > 0) return unionDomRects(descendantRects)
    }

    const rect = element.getBoundingClientRect()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }

    function unionDomRects(rects: DOMRect[]): { x: number; y: number; width: number; height: number } {
      const left = Math.min(...rects.map((rect) => rect.left))
      const top = Math.min(...rects.map((rect) => rect.top))
      const right = Math.max(...rects.map((rect) => rect.right))
      const bottom = Math.max(...rects.map((rect) => rect.bottom))
      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }
    }
  }, previewCaptureBoundsSelector)
}

async function gotoWhenReady(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>,
  url: string,
) {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 5_000 })
      if (!response || response.ok()) return
      lastError = new Error(`Preview returned HTTP ${response.status()} for ${url}`)
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for preview URL: ${url}`)
}
