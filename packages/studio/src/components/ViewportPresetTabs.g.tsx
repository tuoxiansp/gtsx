import type { GCases } from "gtsx"

type ViewportPreset = "phone" | "tablet" | "desktop"

type ViewportPresetTabsProps = {
  selectedPreset: ViewportPreset
  onChange?: (preset: ViewportPreset) => void
}

const presets = ["phone", "tablet", "desktop"] satisfies ViewportPreset[]

export default function ViewportPresetTabs(props: ViewportPresetTabsProps) {
  const selectedIndex = Math.max(0, presets.indexOf(props.selectedPreset))

  return (
    <div
      aria-label="Viewport"
      style={{
        background: "rgba(255,255,255,0.82)",
        border: "1px solid rgba(216,222,232,0.92)",
        borderRadius: 999,
        boxShadow: "0 10px 30px rgba(31,35,40,0.12)",
        display: "grid",
        gridTemplateColumns: `repeat(${presets.length}, 34px)`,
        padding: 3,
        position: "relative",
        width: "max-content",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          background: "#ffffff",
          border: "1px solid #d8dee8",
          borderRadius: 999,
          boxShadow: "0 3px 10px rgba(31,35,40,0.12)",
          height: 28,
          left: 3,
          position: "absolute",
          top: 3,
          transform: `translateX(${selectedIndex * 34}px)`,
          transition: "transform 120ms ease",
          width: 32,
        }}
      />
      {presets.map((preset) => (
        <button
          aria-label={`Viewport ${preset}`}
          key={preset}
          onClick={() => props.onChange?.(preset)}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            color: props.selectedPreset === preset ? "#0969da" : "#57606a",
            cursor: props.onChange ? "pointer" : "default",
            display: "grid",
            height: 28,
            justifyItems: "center",
            padding: 0,
            position: "relative",
            width: 32,
            zIndex: 1,
          }}
          title={preset}
          type="button"
        >
          <ViewportPresetIcon preset={preset} />
        </button>
      ))}
    </div>
  )
}

ViewportPresetTabs.cases = {
  tabletSelected: {
    props: {
      selectedPreset: "tablet",
    },
  },
} satisfies GCases<ViewportPresetTabsProps>

function ViewportPresetIcon(props: { preset: ViewportPreset }) {
  if (props.preset === "phone") {
    return <span aria-hidden="true" style={{ border: "1.5px solid currentColor", borderRadius: 3, height: 16, width: 9 }} />
  }

  if (props.preset === "tablet") {
    return <span aria-hidden="true" style={{ border: "1.5px solid currentColor", borderRadius: 3, height: 15, width: 12 }} />
  }

  return <span aria-hidden="true" style={{ border: "1.5px solid currentColor", borderRadius: 2, height: 11, width: 18 }} />
}
