import { describe, expect, it } from "vitest"

import { transformGTSXComponentBoundaries } from "../src/index.js"

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
})
