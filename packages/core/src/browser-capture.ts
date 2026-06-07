import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"

import { chromium } from "playwright"

export type BrowserCaptureOptions = {
  cwd: string
  url: string
  viewport: string
  out: string
}

export async function capturePreviewPage(options: BrowserCaptureOptions): Promise<void> {
  const originalCwd = process.cwd()
  process.chdir(options.cwd)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch()
    const page = await browser.newPage({ viewport: parseViewport(options.viewport) })
    await gotoWhenReady(page, options.url)
    await page.screenshot({ path: join(options.cwd, options.out), fullPage: true })
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
