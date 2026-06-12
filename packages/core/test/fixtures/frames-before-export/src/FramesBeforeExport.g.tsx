import type { GFrames } from "@runelight/react/runtime"

FramesBeforeExport.frames = {
  ready: { props: { label: "Ready" } },
} satisfies GFrames<FramesBeforeExportProps>

type FramesBeforeExportProps = {
  label: string
}

export function FramesBeforeExport(props: FramesBeforeExportProps) {
  return <span>{props.label}</span>
}
