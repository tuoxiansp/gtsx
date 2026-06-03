import type { GFrames } from "@gtsx/core"

function Order() {
  return <article>Order</article>
}

export default function OrderPreview() {
  const GtsxPreviewComponent = Order as any

  return <GtsxPreviewComponent />
}

OrderPreview.frames = {
  ready: {
    props: {},
  },
} satisfies GFrames<Record<string, never>>
