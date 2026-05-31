import type { GCases } from "@gtsx/core"

function PureChild() {
  return <span>Pure</span>
}

export default function AliasPureDependency() {
  const PreviewChild = PureChild as any

  return <PreviewChild />
}

AliasPureDependency.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
