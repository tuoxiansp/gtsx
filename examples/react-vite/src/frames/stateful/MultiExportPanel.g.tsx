import type { GFrames } from "@runelight/react/runtime"

type PanelProps = {
  label: string
}

export function NamedPanel(props: PanelProps) {
  return <section className="named-panel">Named export: {props.label}</section>
}

NamedPanel.frames = {
  namedReady: { description: "namedReady frame", props: { label: "selected by file coordinate" } },
} satisfies GFrames<PanelProps>

export default function DefaultPanel(props: PanelProps) {
  return <section className="named-panel">Default export: {props.label}</section>
}

DefaultPanel.frames = {
  defaultReady: { description: "defaultReady frame", props: { label: "default coordinate" } },
} satisfies GFrames<PanelProps>
