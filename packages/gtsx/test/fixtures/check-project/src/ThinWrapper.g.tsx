import type { GCases } from "@gtsx/core"

function Order() {
  return <article>Order</article>
}

export default function OrderPreview() {
  const GtsxPreviewComponent = Order as any

  return <GtsxPreviewComponent />
}

OrderPreview.cases = {
  ready: {
    props: {},
  },
} satisfies GCases<Record<string, never>>
