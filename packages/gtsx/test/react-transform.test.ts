import { describe, expect, it } from "vitest"

import {
  isGTSXReactComponentFile,
  normalizeGTSXReactModuleId,
  transformGTSXComponentBoundaries,
  transformGTSXReactModule,
} from "../src/react-transform.js"

const root = "/repo"

describe("GTSX React transform", () => {
  it("wraps default component exports that declare frames", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.frames = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output).toContain('import { defineGComponent as __gtsxDefineGComponent } from "@gtsx/core"')
    expect(output).toContain("function CardGTSXImpl(props: { label: string })")
    expect(output).toContain('const Card = __gtsxDefineGComponent("src/Card.g.tsx#default", CardGTSXImpl)')
    expect(output).toContain("export default Card")
    expect(output).toContain("Card.frames = {")
  })

  it("keeps directive prologues before injected imports", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `"use client"

export default function Card(props: { label: string }) {
  return <span>{props.label}</span>
}

Card.frames = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output.startsWith('"use client"\nimport { defineGComponent as __gtsxDefineGComponent } from "@gtsx/core"')).toBe(true)
  })

  it("wraps named component exports that declare frames", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
export function NamedCard(props: { label: string }) {
  return <span>{props.label}</span>
}

NamedCard.frames = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output).toContain("function NamedCardGTSXImpl(props: { label: string })")
    expect(output).toContain(
      'export const NamedCard = __gtsxDefineGComponent("src/Card.g.tsx#NamedCard", NamedCardGTSXImpl)',
    )
    expect(output).toContain("NamedCard.frames = {")
  })

  it("wraps local components exported from a list", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
function NamedCard(props: { label: string }) {
  return <span>{props.label}</span>
}

NamedCard.frames = {
  ready: { props: { label: "Ready" } },
}

function Helper() {
  return <span>helper</span>
}

export { NamedCard, Helper }
`,
    })

    expect(output).toContain("function NamedCardGTSXImpl(props: { label: string })")
    expect(output).toContain('const NamedCard = __gtsxDefineGComponent("src/Card.g.tsx#NamedCard", NamedCardGTSXImpl)')
    expect(output).toContain("export { NamedCard, Helper }")
    expect(output).toContain("NamedCard.frames = {")
    expect(output).not.toContain("HelperGTSXImpl")
  })

  it("wraps arrow function components exported from a list", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Toaster.g.tsx",
      code: `
const Toaster = (props: { richColors?: boolean }) => {
  return <span>{props.richColors ? "rich" : "default"}</span>
}

Toaster.frames = {
  default: { props: {} },
}

export { Toaster }
`,
    })

    expect(output).toContain("const ToasterGTSXImpl = (props: { richColors?: boolean }) =>")
    expect(output).toContain('const Toaster = __gtsxDefineGComponent("src/Toaster.g.tsx#Toaster", ToasterGTSXImpl)')
    expect(output).toContain("export { Toaster }")
    expect(output).toContain("Toaster.frames = {")
  })

  it("wraps default export assignments separately from named component exports", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      code: `
export function NamedCard(props: { label: string }) {
  return <span>{props.label}</span>
}

NamedCard.frames = {
  ready: { props: { label: "Ready" } },
}

export default NamedCard
`,
    })

    expect(output).toContain("function NamedCardGTSXImpl(props: { label: string })")
    expect(output).toContain(
      'export const NamedCard = __gtsxDefineGComponent("src/Card.g.tsx#NamedCard", NamedCardGTSXImpl)',
    )
    expect(output).toContain('const NamedCardGTSXDefault = __gtsxDefineGComponent("src/Card.g.tsx#default", NamedCardGTSXImpl)')
    expect(output).toContain("NamedCardGTSXDefault.frames = NamedCard.frames")
    expect(output).toContain("export default NamedCardGTSXDefault")
  })

  it("wraps multiple component exports independently", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Multi.g.tsx",
      code: `
export function First() {
  return <span>first</span>
}

First.frames = {
  ready: { props: {} },
}

export function Second() {
  return <span>second</span>
}

Second.frames = {
  ready: { props: {} },
}
`,
    })

    expect(output).toContain('export const First = __gtsxDefineGComponent("src/Multi.g.tsx#First", FirstGTSXImpl)')
    expect(output).toContain('export const Second = __gtsxDefineGComponent("src/Multi.g.tsx#Second", SecondGTSXImpl)')
  })

  it("can emit a preview graph without changing ordinary imports", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      previewImportQuery: "gtsx-preview",
      code: `
import { Child } from "./Child.g"
import { Other } from "./Other"
import { AliasChild } from "@fixture/Child.g"
import type { ChildProps } from "./Child.g"
export { Badge } from "@/components/Badge.g"

export function Card(props: ChildProps) {
  return <><Child {...props} /><AliasChild {...props} /></>
}

Card.frames = {
  ready: { props: { label: "Ready" } },
}
`,
    })

    expect(output.startsWith('"use client"\n')).toBe(false)
    expect(output).toContain('from "./Child.g?gtsx-preview"')
    expect(output).toContain('from "./Other"')
    expect(output).toContain('from "@fixture/Child.g?gtsx-preview"')
    expect(output).toContain('from "@/components/Badge.g?gtsx-preview"')
    expect(output).toContain('export const Card = __gtsxDefineGComponent("src/Card.g.tsx#Card", CardGTSXImpl)')
  })

  it("propagates preview queries through wrapper files without frames", () => {
    const code = `
import { Child } from "./Child.g"
export { Badge } from "@fixture/Badge.g"

export function Wrapper() {
  return <Child label="Ready" />
}
`

    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Wrapper.g.tsx",
      previewImportQuery: "gtsx-preview",
      code,
    })

    expect(output).toContain('from "./Child.g?gtsx-preview"')
    expect(output).toContain('from "@fixture/Badge.g?gtsx-preview"')
    expect(output).not.toContain("@gtsx/core")
    expect(output).not.toContain("__gtsxDefineGComponent")
    expect(transformGTSXReactModule({ root, filePath: "/repo/src/Wrapper.g.tsx", previewImportQuery: "gtsx-preview", code })).toEqual({
      code: output,
      filePath: "/repo/src/Wrapper.g.tsx",
    })
  })

  it("removes server-only preview markers from preview graphs", () => {
    const output = transformGTSXComponentBoundaries({
      root,
      filePath: "/repo/src/Card.g.tsx",
      previewImportQuery: "gtsx-preview",
      code: `
"use server"
"use cache: private"

import "server-only"
import { Child } from "./Child.g"

async function saveCard() {
  "use server"
}

export function Card() {
  void saveCard
  return <Child label="Ready" />
}

Card.frames = {
  ready: { props: {} },
}
`,
    })

    expect(output).not.toContain('"use server"')
    expect(output).not.toContain('"use cache: private"')
    expect(output).not.toContain('import "server-only"')
    expect(output).not.toContain('"use client"')
    expect(output).toContain('from "./Child.g?gtsx-preview"')
    expect(output).toContain('export const Card = __gtsxDefineGComponent("src/Card.g.tsx#Card", CardGTSXImpl)')
  })

  it("leaves component exports without frames untouched", () => {
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

  it("normalizes bundler ids before deciding whether to transform", () => {
    expect(normalizeGTSXReactModuleId("/repo/src/Card.g.tsx?import")).toBe("/repo/src/Card.g.tsx")
    expect(isGTSXReactComponentFile("/repo/src/Card.g.tsx?import")).toBe(true)
    expect(isGTSXReactComponentFile("/repo/src/Card.tsx?import")).toBe(false)
  })

  it("returns null when adapter callers do not need to emit transformed code", () => {
    const code = `
export function PlainComponent() {
  return <span>plain</span>
}
`

    expect(transformGTSXReactModule({ root, filePath: "/repo/src/Card.tsx", code })).toBeNull()
    expect(transformGTSXReactModule({ root, filePath: "/repo/src/Plain.g.tsx", code })).toBeNull()
  })
})
