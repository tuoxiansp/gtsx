import type { GFrames } from "@runelight/react/runtime"

function Order() {
  return <article>Order</article>
}

export default function OrderPreview() {
  const RunelightPreviewComponent = Order as any

  return <RunelightPreviewComponent />
}

OrderPreview.frames = {
  ready: {
    description: "ready frame",
    props: {},
  },
} satisfies GFrames<Record<string, never>>
