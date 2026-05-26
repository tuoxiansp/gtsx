import { describe, expect, it } from "vitest"
import { createRequire } from "node:module"

import { gtsxNextReact } from "../src/index.js"

const require = createRequire(import.meta.url)

describe("gtsx Next React adapter", () => {
  it("adds webpack and turbopack rules for .g.tsx files", () => {
    const withGTSX = gtsxNextReact({ root: "/repo" })
    const config = withGTSX({
      allowedDevOrigins: ["127.0.0.1"],
    })

    const webpackConfig = config.webpack?.({}, {})
    const webpackRule = webpackConfig?.module?.rules?.[0]
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackRule?.test?.test("Card.g.tsx")).toBe(true)
    expect(webpackRule?.enforce).toBe("pre")
    expect(webpackRule?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackRule?.use?.[0]?.options).toEqual({
      root: "/repo",
      transformPath: expect.stringContaining("react-transform.js"),
    })
    expect(turboRule).toEqual({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: { root: "/repo", transformPath: expect.stringContaining("react-transform.js") },
        },
      ],
      as: "*.tsx",
    })
  })

  it("preserves user webpack config and prepends existing turbopack rules", () => {
    const withGTSX = gtsxNextReact({ root: "/repo" })
    const config = withGTSX({
      webpack(current, _context) {
        current.module = { rules: [{ test: /other/ }] }
        return current
      },
      turbopack: {
        rules: {
          "*.g.tsx": [{ loaders: ["other-loader"], as: "*.tsx" }],
        },
      },
    })

    const webpackConfig = config.webpack?.({}, {})
    const turboRule = config.turbopack?.rules?.["*.g.tsx"]

    expect(webpackConfig?.module?.rules).toHaveLength(2)
    expect(webpackConfig?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(webpackConfig?.module?.rules?.[1]?.test?.test("other")).toBe(true)
    expect(Array.isArray(turboRule)).toBe(true)
    expect((turboRule as unknown[])[0]).toMatchObject({
      loaders: [
        {
          loader: expect.stringContaining("loader.cjs"),
          options: { root: "/repo", transformPath: expect.stringContaining("react-transform.js") },
        },
      ],
      as: "*.tsx",
    })
    expect((turboRule as unknown[])[1]).toEqual({ loaders: ["other-loader"], as: "*.tsx" })
  })

  it("exposes a CommonJS entry for Next config loading", () => {
    const cjsEntry = require("../index.cjs") as typeof import("../src/index.js")
    const config = cjsEntry.gtsxNextReact({ root: "/repo" })({})

    expect(config.webpack?.({}, {})?.module?.rules?.[0]?.use?.[0]?.loader).toContain("loader.cjs")
    expect(config.turbopack?.rules?.["*.g.tsx"]?.loaders?.[0]?.loader).toContain("loader.cjs")
  })
})
