import React from "react"
import type { GFrames } from "@runelight/react/runtime"

import {
  studioSegmentedControlButtonStyle,
  studioSegmentedControlContainerStyle,
  studioSegmentedControlLabelStyle,
  studioViewportControlContainerStyle,
  studioViewportTabButtonStyle,
  studioViewportTabHighlightMotionStyle,
  studioViewportTabHighlightStyle,
} from "../studio-theme"

type ViewportPreset = "phone" | "tablet" | "desktop"

type ViewportPresetTabsProps = {
  floating?: boolean
  selectedPreset: ViewportPreset
  onChange?: (preset: ViewportPreset) => void
}

const presets = ["phone", "tablet", "desktop"] satisfies ViewportPreset[]

const presetLabels: Record<ViewportPreset, string> = {
  phone: "phone",
  tablet: "laptop",
  desktop: "desktop",
}

function ViewportPresetTabsView(props: ViewportPresetTabsProps) {
  const selectedIndex = Math.max(0, presets.indexOf(props.selectedPreset))

  return (
    <div
      aria-label="Viewport"
      data-runelight-canvas-wheel-exempt
      data-runelight-floating-viewport-controls={props.floating ? true : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        ...(props.floating ? studioViewportControlContainerStyle() : studioSegmentedControlContainerStyle()),
        ...(props.floating
          ? {
              bottom: 16,
              left: 16,
              position: "absolute" as const,
              zIndex: 3,
            }
          : {
              position: "relative" as const,
              width: "max-content",
            }),
      }}
    >
      <span
        aria-hidden="true"
        style={{ ...studioSegmentedControlLabelStyle(), fontWeight: 400, position: "relative", zIndex: 1 }}
      >
        Viewport
      </span>
      <div
        style={{
          display: "flex",
          overflow: "visible",
          position: "relative",
        }}
      >
        {props.floating ? (
          <span
            aria-hidden="true"
            data-runelight-viewport-tab-highlight={true}
            style={{
              ...studioViewportTabHighlightStyle(),
              ...studioViewportTabHighlightMotionStyle(),
              transform: `translateX(${selectedIndex * 100}%)`,
              width: `${100 / presets.length}%`,
            }}
          />
        ) : null}
        {presets.map((preset) => {
          const pressed = props.selectedPreset === preset
          return (
            <button
              aria-label={`Viewport ${presetLabels[preset]}`}
              data-runelight-viewport-control={preset}
              key={preset}
              onClick={() => props.onChange?.(preset)}
              style={{
                ...(props.floating ? studioViewportTabButtonStyle(pressed) : studioSegmentedControlButtonStyle(pressed)),
                cursor: props.onChange ? "pointer" : "default",
                flex: props.floating ? 1 : undefined,
                fontWeight: 600,
                minWidth: props.floating ? 0 : undefined,
              }}
              title={presetLabels[preset]}
              type="button"
            >
              {presetLabels[preset]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const ViewportPresetTabs = React.memo(ViewportPresetTabsView) as typeof ViewportPresetTabsView & {
  frames?: GFrames<ViewportPresetTabsProps>
}

export default ViewportPresetTabs

ViewportPresetTabs.frames = {
  tabletSelected: {
    description: "tabletSelected frame",
    props: {
      selectedPreset: "tablet",
    },
  },
  floatingPhoneSelected: {
    description: "floatingPhoneSelected frame",
    props: {
      floating: true,
      selectedPreset: "phone",
    },
  },
} satisfies GFrames<ViewportPresetTabsProps>
