"use client"

import { GTSXReactPreviewClient, type GTSXReactPreviewClientProps } from "@gtsx/preview-react"

export type { GTSXPreviewFrame, GTSXPreviewComponent, GTSXPreviewModule } from "@gtsx/preview-react"

export type GTSXNextPreviewClientProps = Omit<GTSXReactPreviewClientProps, "loadComponent">

export function GTSXNextPreviewClient(props: GTSXNextPreviewClientProps) {
  return <GTSXReactPreviewClient {...props} loadComponent={loadGTSXNextPreviewComponent} />
}

async function loadGTSXNextPreviewComponent(entry: string) {
  const { loadGTSXPreviewComponent } = await import("@gtsx/adapter-next-react/preview-entries")
  return loadGTSXPreviewComponent(entry)
}
