import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright"

const root = dirname(fileURLToPath(import.meta.url))
const cwd = join(root, "..")
const capturesRoot = join(cwd, "public/captures")
const casesDir = join(capturesRoot, "cases")
const siteDir = join(capturesRoot, "site")
const port = 5199
const baseUrl = `http://127.0.0.1:${port}`

mkdirSync(casesDir, { recursive: true })
mkdirSync(siteDir, { recursive: true })

const contactSheetCaptures = []
const singleFrameCaptures = []

function runContactSheetCapture(capture) {
  execFileSync(
    "pnpm",
    ["exec", "runelight", "capture", capture.entry, "--out", capture.out, "--viewport", capture.viewport, "--port", String(port)],
    { cwd, stdio: "inherit" },
  )
}

function runSingleFrameCapture(capture) {
  execFileSync(
    "pnpm",
    [
      "exec",
      "runelight",
      "capture",
      capture.entry,
      "--frame",
      capture.frame,
      "--out",
      capture.out,
      "--viewport",
      capture.viewport,
      "--port",
      String(port),
    ],
    { cwd, stdio: "inherit" },
  )
}

async function cropPng(browser, inputPath, outputPath, crop) {
  const imagePath = join(cwd, inputPath)
  const encoded = readFileSync(imagePath).toString("base64")
  const page = await browser.newPage({ viewport: { width: crop.width, height: crop.height } })

  try {
    const dataUrl = await page.evaluate(async ({ crop, source }) => {
      const image = new Image()
      image.src = source
      await image.decode()

      const canvas = document.createElement("canvas")
      canvas.width = crop.width
      canvas.height = crop.height

      const context = canvas.getContext("2d")
      if (!context) throw new Error("Could not create image crop context")

      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
      return canvas.toDataURL("image/png")
    }, {
      crop,
      source: `data:image/png;base64,${encoded}`,
    })

    writeFileSync(join(cwd, outputPath), Buffer.from(dataUrl.split(",")[1], "base64"))
  } finally {
    await page.close()
  }
}

async function cropCapturedPng(browser, capture) {
  if (!capture.crop) return
  await cropPng(browser, capture.out, capture.out, capture.crop)
}

async function cropContactSheetCaptures() {
  const browser = await chromium.launch()
  try {
    for (const capture of contactSheetCaptures) {
      await cropCapturedPng(browser, capture)
    }
  } finally {
    await browser.close()
  }
}

async function createStudioDesignDerivatives() {
  const browser = await chromium.launch()
  try {
    await cropPng(browser, "public/captures/studio-components.png", "public/captures/studio-components-focus.png", {
      height: 620,
      width: 900,
      x: 0,
      y: 0,
    })
    await cropPng(browser, "public/captures/studio-design.png", "public/captures/studio-design-strip.png", {
      height: 360,
      width: 1500,
      x: 0,
      y: 0,
    })
  } finally {
    await browser.close()
  }
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function waitForStudioPreviews(page, minimumCount = 1) {
  await page.waitForFunction((expectedCount) => {
    const previews = document.querySelectorAll("[data-runelight-frame-preview-content]")
    return previews.length >= expectedCount
  }, minimumCount, { timeout: 120_000 })
  await page.waitForTimeout(3_000)
}

async function clickStudioFrameTile(page, coordinate, frameName) {
  const selector = `[data-runelight-frame-grid="${coordinate}"] [data-runelight-frame-tile="${frameName}"]`
  await page.waitForSelector(selector, { timeout: 120_000 })
  await page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector)
    if (!(element instanceof HTMLElement)) throw new Error(`Missing Studio frame tile: ${targetSelector}`)
    element.click()
  }, selector)
}

async function clipToCards(page, padding = 56) {
  return page.evaluate((pad) => {
    const nodes = [
      ...document.querySelectorAll("[data-runelight-card-coordinate]"),
      ...document.querySelectorAll("[data-runelight-studio-design-card]"),
    ]

    if (nodes.length === 0) return null

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = 0
    let maxY = 0

    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue
      minX = Math.min(minX, rect.left)
      minY = Math.min(minY, rect.top)
      maxX = Math.max(maxX, rect.right)
      maxY = Math.max(maxY, rect.bottom)
    }

    if (!Number.isFinite(minX)) return null

    return {
      x: Math.max(0, Math.floor(minX - pad)),
      y: Math.max(0, Math.floor(minY - pad)),
      width: Math.max(1, Math.ceil(maxX - minX + pad * 2)),
      height: Math.max(1, Math.ceil(maxY - minY + pad * 2)),
    }
  }, padding)
}

async function captureStudioScreenshots() {
  const server = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd,
    stdio: "pipe",
  })

  try {
    await waitForUrl(`${baseUrl}/`)

    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1700, height: 1040 } })

    try {
      const landingScreenCoordinate = "src/app/LandingScreen.g.tsx#LandingScreen"
      const componentSelection = encodeURIComponent(`component:${landingScreenCoordinate}`)

      await page.goto(`${baseUrl}/runelight/studio?selection=${componentSelection}&canvasViewport=desktop`, { waitUntil: "networkidle" })
      await page.waitForSelector('[data-runelight-studio-shell-loading="true"]', { state: "detached", timeout: 120_000 })
      await page.waitForSelector("[data-runelight-frame-grid]", { timeout: 120_000 })
      await waitForStudioPreviews(page)
      await clickStudioFrameTile(page, landingScreenCoordinate, "live")
      await page.waitForFunction(() => document.querySelectorAll('[data-runelight-column-index="1"] [data-runelight-card-coordinate]').length >= 5, { timeout: 120_000 })
      await waitForStudioPreviews(page, 6)

      const componentsClip = await clipToCards(page, 32)
      if (componentsClip) {
        componentsClip.height = Math.min(componentsClip.height, 1120)
        await page.screenshot({
          path: join(capturesRoot, "studio-components.png"),
          clip: componentsClip,
        })
      } else {
        await page.locator("[data-runelight-canvas-viewport]").screenshot({
          path: join(capturesRoot, "studio-components.png"),
        })
      }

      await page.setViewportSize({ width: 2600, height: 2200 })
      await page.goto(`${baseUrl}/runelight/studio#/design`, { waitUntil: "networkidle" })
      await page.waitForSelector('[data-runelight-studio-design-workspace="true"]', { timeout: 120_000 })
      await page.waitForFunction(() => document.querySelectorAll("[data-runelight-studio-design-card]").length >= 8, { timeout: 120_000 })
      await waitForStudioPreviews(page, 8)

      const designClip = await clipToCards(page, 48)
      if (designClip) {
        designClip.height = Math.max(designClip.height, 1120)
        await page.screenshot({
          path: join(capturesRoot, "studio-design.png"),
          clip: designClip,
        })
      } else {
        await page.locator('[data-runelight-studio-design-canvas="true"]').screenshot({
          path: join(capturesRoot, "studio-design.png"),
        })
      }
    } finally {
      await browser.close()
    }
  } finally {
    server.kill("SIGTERM")
  }
}

for (const capture of contactSheetCaptures) {
  console.log(`Capturing ${capture.out}...`)
  runContactSheetCapture(capture)
}

console.log("Cropping contact sheet captures...")
await cropContactSheetCaptures()

console.log("Capturing Studio screenshots...")
await captureStudioScreenshots()
await createStudioDesignDerivatives()

for (const capture of singleFrameCaptures) {
  console.log(`Capturing ${capture.out}...`)
  runSingleFrameCapture(capture)
}

console.log("Capture complete.")
