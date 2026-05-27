"use client"

import { GTSXReactPreviewClient, type GTSXReactPreviewClientProps } from "@gtsx/preview-react"
import { loadGTSXPreviewComponent } from "@gtsx/adapter-next-react/preview-entries"

export type { GTSXPreviewCase, GTSXPreviewComponent, GTSXPreviewModule } from "@gtsx/preview-react"

export type GTSXNextPreviewClientProps = Omit<GTSXReactPreviewClientProps, "loadComponent">

export function GTSXNextPreviewClient(props: GTSXNextPreviewClientProps) {
  return <GTSXReactPreviewClient {...props} loadComponent={loadGTSXPreviewComponent} />
}
