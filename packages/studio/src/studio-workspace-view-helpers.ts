import type { StudioCanvasTransform, StudioWorkspaceState } from "./client"

export type StudioCanvasViewportAnchorPoint = {
  x: number
  y: number
}

export function preserveStudioCanvasViewportAnchor(
  current: StudioCanvasTransform,
  input: {
    currentViewportPoint: StudioCanvasViewportAnchorPoint
    targetViewportPoint: StudioCanvasViewportAnchorPoint
  },
): StudioCanvasTransform {
  const deltaX = input.targetViewportPoint.x - input.currentViewportPoint.x
  const deltaY = input.targetViewportPoint.y - input.currentViewportPoint.y
  if (deltaX === 0 && deltaY === 0) return current

  return {
    ...current,
    x: current.x + deltaX,
    y: current.y + deltaY,
  }
}

export function layoutNeutralDrilldownColumnEnterIdentity(
  workspace: StudioWorkspaceState,
  columnIndex: number,
  column: StudioWorkspaceState["columns"][number],
): string {
  if (columnIndex === 0) return "root"

  return [
    `column:${columnIndex}`,
    `path:${workspace.selectedCoordinatePath.slice(0, columnIndex).join(" > ")}`,
    `parent:${column.parentCoordinate ?? ""}`,
    `components:${column.components.map((component) => component.coordinate).join(",")}`,
  ].join("|")
}
