import type { GFrames } from "@runelight/react/runtime"

function PureChild() {
  return <span>Pure</span>
}

export default function AliasPureDependency() {
  const PreviewChild = PureChild as any

  return <PreviewChild />
}

AliasPureDependency.frames = {
  ready: { props: {} },
} satisfies GFrames<Record<string, never>>
