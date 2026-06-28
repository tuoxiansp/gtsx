import type { GFrames } from "@runelight/react/runtime"
import type { GBoundaryRect } from "@runelight/core/boundary-rect"

type ComponentBoundsHitTargetProps = {
  coordinate: string
  onSelect?: () => void
  rect: GBoundaryRect
}

export default function ComponentBoundsHitTarget(props: ComponentBoundsHitTargetProps) {
  return (
    <div
      aria-hidden="true"
      data-runelight-card-select-coordinate={props.coordinate}
      data-runelight-card-select-target="component-bounds"
      onClick={
        props.onSelect
          ? (event) => {
              event.stopPropagation()
              props.onSelect?.()
            }
          : undefined
      }
      onPointerDown={props.onSelect ? (event) => event.stopPropagation() : undefined}
      style={{
        height: props.rect.height,
        left: props.rect.x,
        pointerEvents: props.onSelect ? "auto" : "none",
        position: "absolute",
        top: props.rect.y,
        width: props.rect.width,
        zIndex: 2,
      }}
    />
  )
}

ComponentBoundsHitTarget.frames = {
  userCardBounds: {
    description: "userCardBounds frame",
    props: {
      coordinate: "src/UserCard.g.tsx#default",
      rect: { x: 12, y: 20, width: 320, height: 88 },
    },
  },
} satisfies GFrames<ComponentBoundsHitTargetProps>
