import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

const screenshot = vi.hoisted(() => vi.fn(async () => undefined))
const close = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      close,
      newPage: vi.fn(async () => ({
        evaluate: vi.fn(async () => null),
        goto: vi.fn(async () => ({ ok: () => true })),
        screenshot,
        waitForFunction: vi.fn(async () => undefined),
      })),
    })),
  },
}))

import { capturePreviewPage } from "../src/browser-capture.js"

describe("Playwright browser capture backend", () => {
  afterEach(() => {
    screenshot.mockClear()
    close.mockClear()
  })

  it("preserves absolute output paths", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-capture-cwd-"))
    const outRoot = mkdtempSync(join(tmpdir(), "runelight-capture-out-"))
    const out = join(outRoot, "nested/capture.png")

    try {
      await capturePreviewPage({
        cwd,
        out,
        url: "http://127.0.0.1:4300/runelight",
        viewport: "800x600",
      })

      expect(screenshot).toHaveBeenCalledWith(expect.objectContaining({ path: out }))
    } finally {
      rmSync(cwd, { force: true, recursive: true })
      rmSync(outRoot, { force: true, recursive: true })
    }
  })
})
