import type { GFrames } from "@runelight/react/runtime"

type DesignSketchProps = {
  label: string
}

export default function DesignSketch(props: DesignSketchProps) {
  return <section>{props.label}</section>
}

DesignSketch.frames = {
  ready: { props: { label: "Design ready" } },
} satisfies GFrames<DesignSketchProps>
