"use client"

import { RunelightReactPreviewClient, type RunelightReactPreviewClientProps } from "@runelight/preview-react"

export type { RunelightPreviewFrame, RunelightPreviewComponent, RunelightPreviewModule } from "@runelight/preview-react"

export type RunelightNextPreviewClientProps = Omit<RunelightReactPreviewClientProps, "loadComponent">

export function RunelightNextPreviewClient(props: RunelightNextPreviewClientProps) {
  return <RunelightReactPreviewClient {...props} loadComponent={loadRunelightNextPreviewComponent} />
}

async function loadRunelightNextPreviewComponent(entry: string) {
  const { loadRunelightPreviewComponent } = await import("@runelight/adapter-next-react/preview-entries")
  return loadRunelightPreviewComponent(entry)
}
