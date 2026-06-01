import type { CSSProperties } from "react"

export const studioFontFamily =
  '"JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

export const studioColors = {
  canvasBg: "#181818",
  panelBg: "#1e1e1e",
  panelBgElevated: "#282828",
  panelBorder: "#3a3a3a",
  panelBorderSubtle: "#2e2e2e",
  dotGrid: "rgba(255,255,255,0.07)",
  text: "#d4d4d4",
  textMuted: "#a0a0a0",
  textDim: "#8f8f8f",
  textLabel: "#9a9a9a",
  textTitle: "#a8a8a8",
  accent: "#ff8c82",
  accentText: "#e68a7d",
  accentBorder: "#ff8c82",
  accentMuted: "rgba(255,140,130,0.28)",
  buttonPrimaryBg: "#ff8c82",
  buttonPrimaryText: "#ffffff",
  buttonSecondaryBg: "#e8e4e0",
  buttonSecondaryText: "#2a2a2a",
  buttonDisabledBg: "#3d2e2c",
  buttonDisabledText: "#5a4a48",
  selectionOutline: "#ff8c82",
  mismatchBorder: "rgba(136,136,136,0.72)",
  warningBg: "rgba(255,200,80,0.1)",
  warningBorder: "#a67c00",
  warningText: "#f0d080",
  error: "#e06060",
  errorBg: "rgba(224,96,96,0.12)",
  errorBorder: "#b05050",
  errorText: "#f0a0a0",
} as const

export const studioRadii = {
  sm: 4,
  md: 6,
  pill: 999,
} as const

export const studioTypography = {
  cardTitle: {
    fontSize: 9,
    fontWeight: 400,
    letterSpacing: "0.06em",
    lineHeight: 1,
  },
  caseLabel: {
    fontSize: 9,
    fontWeight: 400,
    letterSpacing: "0.05em",
    lineHeight: 1.35,
  },
  controlLabel: {
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: "0.06em",
    lineHeight: 1.2,
  },
  controlValue: {
    fontSize: 9,
    fontWeight: 400,
    letterSpacing: "0.04em",
    lineHeight: 1.2,
  },
} as const

export const studioCardTitleMotionMs = 120

export const studioViewportHighlightMotionMs = 210

// Moderate overshoot: visible spring without overshooting too far.
export const studioViewportHighlightEasing = "cubic-bezier(0.34, 1.26, 0.64, 1)"

export const studioDrilldownColumnEnterMotionMs = 240

export const studioDrilldownColumnEnterEasing = "cubic-bezier(0.22, 1, 0.36, 1)"

export const studioDrilldownColumnEnterKeyframes = `@keyframes gtsx-studio-drilldown-column-enter {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}`

export function studioDrilldownColumnEnterStyle(): CSSProperties {
  return {
    animation: `gtsx-studio-drilldown-column-enter ${studioDrilldownColumnEnterMotionMs}ms ${studioDrilldownColumnEnterEasing} both`,
  }
}

export function studioCardTitleStyle(selected: boolean): CSSProperties {
  return {
    alignItems: "center",
    color: selected ? studioColors.accentText : studioColors.textTitle,
    display: "flex",
    fontFamily: studioFontFamily,
    fontSize: studioTypography.cardTitle.fontSize,
    fontSynthesis: "none",
    fontWeight: studioTypography.cardTitle.fontWeight,
    gap: selected ? 7 : 0,
    letterSpacing: studioTypography.cardTitle.letterSpacing,
    lineHeight: studioTypography.cardTitle.lineHeight,
    minWidth: 0,
    overflow: "hidden",
    textRendering: "geometricPrecision",
    transition: `gap ${studioCardTitleMotionMs}ms ease-out, color ${studioCardTitleMotionMs}ms ease-out`,
  }
}

export function studioCardTitleIndicatorStyle(selected: boolean): CSSProperties {
  return {
    background: studioColors.accentText,
    flexShrink: 0,
    height: 9,
    opacity: selected ? 1 : 0,
    width: selected ? 2 : 0,
    transition: `width ${studioCardTitleMotionMs}ms ease-out, opacity ${studioCardTitleMotionMs}ms ease-out`,
  }
}

export function studioCaseLabelStyle(mismatch: boolean): CSSProperties {
  return {
    color: mismatch ? studioColors.textDim : studioColors.textLabel,
    fontFamily: studioFontFamily,
    fontSize: studioTypography.caseLabel.fontSize,
    fontWeight: studioTypography.caseLabel.fontWeight,
    letterSpacing: studioTypography.caseLabel.letterSpacing,
    lineHeight: studioTypography.caseLabel.lineHeight,
    maxWidth: "100%",
    overflow: "hidden",
    textAlign: "center",
    textOverflow: "ellipsis",
    textTransform: "lowercase",
    whiteSpace: "nowrap",
  }
}

export function studioCanvasBackgroundStyle(): CSSProperties {
  return {
    backgroundColor: studioColors.canvasBg,
    backgroundImage: `radial-gradient(circle at 1px 1px, ${studioColors.dotGrid} 1px, transparent 0)`,
    backgroundSize: "24px 24px",
  }
}

export function studioShellStyle(): CSSProperties {
  return {
    background: studioColors.canvasBg,
    color: studioColors.text,
    fontFamily: studioFontFamily,
    MozOsxFontSmoothing: "grayscale",
    WebkitFontSmoothing: "antialiased",
  }
}

export function studioSegmentedControlContainerStyle(): CSSProperties {
  return {
    background: studioColors.panelBg,
    border: `1px solid ${studioColors.panelBorder}`,
    borderRadius: studioRadii.md,
    display: "flex",
    overflow: "hidden",
  }
}

export function studioViewportControlContainerStyle(): CSSProperties {
  return {
    ...studioSegmentedControlContainerStyle(),
    overflow: "visible",
  }
}

export function studioSegmentedControlLabelStyle(): CSSProperties {
  return {
    alignItems: "center",
    color: studioColors.textDim,
    display: "flex",
    fontFamily: studioFontFamily,
    fontSize: studioTypography.controlLabel.fontSize,
    fontWeight: studioTypography.controlLabel.fontWeight,
    letterSpacing: studioTypography.controlLabel.letterSpacing,
    lineHeight: studioTypography.controlLabel.lineHeight,
    padding: "7px 9px",
    textTransform: "uppercase" as const,
    userSelect: "none" as const,
  }
}

export function studioViewportTabHighlightStyle(): CSSProperties {
  return {
    background: studioColors.panelBgElevated,
    borderBottom: `2px solid ${studioColors.accent}`,
    boxShadow: `inset 0 0 0 1px ${studioColors.accentBorder}`,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    zIndex: 0,
  }
}

export function studioViewportTabHighlightMotionStyle(): CSSProperties {
  return {
    transition: `transform ${studioViewportHighlightMotionMs}ms ${studioViewportHighlightEasing}`,
    willChange: "transform",
  }
}

export function studioViewportTabButtonStyle(selected: boolean): CSSProperties {
  return {
    appearance: "none",
    background: "transparent",
    border: 0,
    borderBottom: "2px solid transparent",
    color: selected ? studioColors.text : studioColors.textMuted,
    cursor: "pointer",
    fontFamily: studioFontFamily,
    fontSize: studioTypography.controlValue.fontSize,
    fontWeight: studioTypography.controlValue.fontWeight,
    letterSpacing: studioTypography.controlValue.letterSpacing,
    lineHeight: studioTypography.controlValue.lineHeight,
    padding: "7px 9px",
    position: "relative",
    textTransform: "lowercase" as const,
    whiteSpace: "nowrap" as const,
    zIndex: 1,
  }
}

export function studioSegmentedControlButtonStyle(pressed: boolean): CSSProperties {
  return {
    appearance: "none",
    background: pressed ? studioColors.panelBgElevated : "transparent",
    border: 0,
    borderBottom: pressed ? `2px solid ${studioColors.accent}` : "2px solid transparent",
    boxShadow: pressed ? `inset 0 0 0 1px ${studioColors.accentBorder}` : undefined,
    color: pressed ? studioColors.text : studioColors.textMuted,
    cursor: "pointer",
    fontFamily: studioFontFamily,
    fontSize: studioTypography.controlValue.fontSize,
    fontWeight: studioTypography.controlValue.fontWeight,
    letterSpacing: studioTypography.controlValue.letterSpacing,
    lineHeight: studioTypography.controlValue.lineHeight,
    padding: "7px 9px",
    textTransform: "lowercase" as const,
    whiteSpace: "nowrap" as const,
  }
}

export function studioProviderVariantButtonStyle(pressed: boolean): CSSProperties {
  return {
    appearance: "none",
    background: pressed ? studioColors.panelBgElevated : "transparent",
    border: `1px solid ${pressed ? studioColors.accentBorder : studioColors.panelBorder}`,
    borderRadius: studioRadii.sm,
    boxShadow: pressed ? `0 0 0 1px ${studioColors.accentMuted}` : undefined,
    color: pressed ? studioColors.text : studioColors.textMuted,
    cursor: "pointer",
    fontFamily: studioFontFamily,
    fontSize: studioTypography.controlValue.fontSize,
    fontWeight: studioTypography.controlValue.fontWeight,
    letterSpacing: studioTypography.controlValue.letterSpacing,
    lineHeight: studioTypography.controlValue.lineHeight,
    maxWidth: 112,
    overflow: "hidden",
    padding: "4px 7px",
    textOverflow: "ellipsis",
    textTransform: "lowercase" as const,
    whiteSpace: "nowrap" as const,
  }
}
