import type { GCases } from "@gtsx/core"

export default function Child() {
  return <span>Child</span>
}

Child.cases = {
  ready: { props: {} },
} satisfies GCases<Record<string, never>>
