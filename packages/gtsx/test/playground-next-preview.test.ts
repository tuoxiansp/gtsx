import { pathToFileURL } from "node:url"

import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

const previewPageUrl = pathToFileURL(
  new URL("../../../playground/next-app-router-init-structure/app/gtsx/page.tsx", import.meta.url).pathname,
).href

describe("Next App Router GTSX preview entry", () => {
  it("renders a selected case from the target project's .g.tsx component", async () => {
    const { default: GTSXPreviewPage } = (await import(/* @vite-ignore */ previewPageUrl)) as {
      default: (props: {
        searchParams?: Promise<{ case?: string }>
      }) => React.ReactElement | Promise<React.ReactElement>
    }
    const element = await GTSXPreviewPage({
      searchParams: Promise.resolve({ case: "routeHandlerTrouble" }),
    })

    const html = renderToStaticMarkup(element)

    expect(html).toContain("Next.js App Router playground")
    expect(html).toContain("Route handler: hanging")
    expect(html).toContain('data-api-state="hanging"')
  })
})
