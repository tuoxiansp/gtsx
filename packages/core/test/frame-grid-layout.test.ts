import { describe, expect, it } from "vitest"

import {
  computeRunelightPreviewFrameGridLayout,
  runelightPreviewFrameGridGap,
  runelightPreviewFrameGridMaxSide,
} from "../src/frame-grid-layout.js"

describe("Runelight preview frame grid layout", () => {
  it("computes a bounded preview grid layout from framework-neutral inputs", () => {
    const layout = computeRunelightPreviewFrameGridLayout({
      gap: runelightPreviewFrameGridGap,
      items: [
        { width: 320, height: 240 },
        { width: 320, height: 240 },
        { width: 320, height: 240 },
      ],
      maxSide: runelightPreviewFrameGridMaxSide("desktop", 3),
      minScale: 0.2,
    })

    expect(layout.columns).toBeGreaterThan(0)
    expect(layout.rows).toBeGreaterThan(0)
    expect(layout.width).toBeLessThanOrEqual(runelightPreviewFrameGridMaxSide("desktop", 3))
    expect(layout.previewScale).toBeGreaterThanOrEqual(0.2)
  })

  it("wraps fixed-scale grids instead of exceeding an explicit max width", () => {
    const layout = computeRunelightPreviewFrameGridLayout({
      items: [
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
        { width: 768, height: 1024 },
      ],
      maxSide: 720,
      maxWidth: 720,
      previewScale: 0.45,
    })

    expect(layout.columns).toBe(2)
    expect(layout.width).toBeLessThanOrEqual(720)
  })
})
