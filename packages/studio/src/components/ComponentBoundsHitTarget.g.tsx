import type { GBoundaryRect, GFrames } from "@runelight/core"

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
      onClick={(event) => {
        event.stopPropagation()
        props.onSelect?.()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        height: props.rect.height,
        left: props.rect.x,
        pointerEvents: "auto",
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
    props: {
      coordinate: "src/UserCard.g.tsx#default",
      rect: { x: 12, y: 20, width: 320, height: 88 },
    },
  },
} satisfies GFrames<ComponentBoundsHitTargetProps>
