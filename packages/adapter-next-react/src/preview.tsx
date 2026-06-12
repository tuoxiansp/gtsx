"use client"

import { RunelightReactPreviewClient, type RunelightReactPreviewClientProps } from "@runelight/react/preview"

export type { RunelightReactPreviewFrame, RunelightReactPreviewComponent, RunelightReactPreviewModule } from "@runelight/react/preview"

export type RunelightNextPreviewClientProps = Omit<RunelightReactPreviewClientProps, "loadComponent">

export function RunelightNextPreviewClient(props: RunelightNextPreviewClientProps) {
  return <RunelightReactPreviewClient {...props} loadComponent={loadRunelightNextPreviewComponent} />
}

async function loadRunelightNextPreviewComponent(entry: string) {
  const { loadRunelightNextPreviewComponent: loadComponent } = await import("@runelight/adapter-next-react/preview-entries")
  return loadComponent(entry)
}
