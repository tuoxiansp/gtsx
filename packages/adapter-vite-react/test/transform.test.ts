import { describe, expect, it } from "vitest"
import { resolve } from "node:path"

import { gtsxViteReact, transformGTSXComponentBoundaries } from "../src/index.js"
import { buildGTSXProjectIndex } from "gtsx/project-index"

const root = "/repo"

describe("gtsx Vite React transform", () => {
  it("wraps default component exports that declare cases", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.cases = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output).toContain('import { defineGComponent as __gtsxDefineGComponent } from "gtsx"')
    expect(output).toContain("function CardGTSXImpl(props: { label: string })")
    expect(output).toContain('const Card = __gtsxDefineGComponent("src/Card.g.tsx#default", CardGTSXImpl)')
    expect(output).toContain("export default Card")
    expect(output).toContain("Card.cases = {")
  })

  it("wraps named component exports that declare cases", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
export function NamedCard(props: { label: string }) {
  return <span>{props.label}</span>
}

NamedCard.cases = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output).toContain("function NamedCardGTSXImpl(props: { label: string })")
    expect(output).toContain(
      'export const NamedCard = __gtsxDefineGComponent("src/Card.g.tsx#NamedCard", NamedCardGTSXImpl)',
    )
    expect(output).toContain("NamedCard.cases = {")
  })

  it("wraps multiple component exports independently", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Multi.g.tsx",
      code: `
export function First() {
  return <span>first</span>
}

First.cases = {
  ready: { props: {} },
}

export function Second() {
  return <span>second</span>
}

Second.cases = {
  ready: { props: {} },
}
`,
    })

    expect(output).toContain('export const First = __gtsxDefineGComponent("src/Multi.g.tsx#First", FirstGTSXImpl)')
    expect(output).toContain('export const Second = __gtsxDefineGComponent("src/Multi.g.tsx#Second", SecondGTSXImpl)')
  })

  it("leaves component exports without cases untouched", () => {
    const code = `
export function PlainComponent() {
  return <span>plain</span>
}
`

    expect(
      transformGTSXComponentBoundaries({
        root,
        filePath: "/repo/src/Plain.g.tsx",
        code,
      }),
    ).toBe(code)
  })

  it("does not expose a Studio manifest virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "src" })
    plugin.configResolved({ root: fixtureRoot })

    expect(plugin.resolveId("virtual:gtsx/studio-manifest")).toBeNull()
  })

  it("loads a low-level GTSX project index through a virtual module", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/check-project")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "src" })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(resolvedId).toBe("\0virtual:gtsx/project-index")
    expect(projectIndex).toEqual(buildGTSXProjectIndex({ cwd: fixtureRoot, projectRoot: "src" }))
    expect(JSON.stringify(projectIndex)).not.toContain("/gtsx/studio")
    expect(JSON.stringify(projectIndex)).not.toContain("urlTemplate")
  })

  it("loads project indexes from a selected TypeScript project scope", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: ".", tsconfigPath: "tsconfig.json" })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/Included.g.tsx"])
  })

  it("loads project indexes from the nearest TypeScript project scope by default", () => {
    const fixtureRoot = resolve(import.meta.dirname, "../../gtsx/test/fixtures/ts-project-scope")
    const plugin = gtsxViteReact({ root: fixtureRoot, projectRoot: "." })
    plugin.configResolved({ root: fixtureRoot })

    const resolvedId = plugin.resolveId("virtual:gtsx/project-index")
    const loaded = plugin.load(resolvedId)
    const projectIndex = JSON.parse(loaded.code.match(/export default (.*)$/s)?.[1] ?? "null")

    expect(projectIndex.files.map((file) => file.path)).toEqual(["src/Included.g.tsx"])
  })
})
