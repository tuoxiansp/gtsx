import type { GBoundaryRect, GFrames } from "@runelight/core"

import { studioColors } from "../studio-theme"

type SelectedBoundaryOutlineProps = {
  rect: GBoundaryRect
}

export default function SelectedBoundaryOutline(props: SelectedBoundaryOutlineProps) {
  return (
    <div
      aria-hidden="true"
      data-runelight-selection-outline="true"
      style={{
        height: props.rect.height,
        left: props.rect.x,
        outline: `1px solid ${studioColors.selectionOutline}`,
        pointerEvents: "none",
        position: "absolute",
        top: props.rect.y,
        width: props.rect.width,
        zIndex: 1,
      }}
    />
  )
}

SelectedBoundaryOutline.frames = {
  userCardSelected: {
    props: {
      rect: { x: 12, y: 20, width: 320, height: 88 },
    },
  },
} satisfies GFrames<SelectedBoundaryOutlineProps>
