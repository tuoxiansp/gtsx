export const studioPreviewPlacementChangedEventType = "runelight:studio-preview-placement-changed"

export function dispatchStudioPreviewPlacementChangedEvent() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(studioPreviewPlacementChangedEventType))
}
