import type { GBoundaryRect, GCases } from "gtsx"

type SelectedBoundaryOutlineProps = {
  rect: GBoundaryRect
}

export default function SelectedBoundaryOutline(props: SelectedBoundaryOutlineProps) {
  return (
    <div
      aria-hidden="true"
      data-gtsx-selection-outline="true"
      style={{
        height: props.rect.height,
        left: props.rect.x,
        outline: "1px solid #0d99ff",
        pointerEvents: "none",
        position: "absolute",
        top: props.rect.y,
        width: props.rect.width,
        zIndex: 1,
      }}
    />
  )
}

SelectedBoundaryOutline.cases = {
  userCardSelected: {
    props: {
      rect: { x: 12, y: 20, width: 320, height: 88 },
    },
  },
} satisfies GCases<SelectedBoundaryOutlineProps>
