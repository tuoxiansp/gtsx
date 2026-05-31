import type { GBoundaryRect, GBoundaryTreeNode } from "@gtsx/core"

const emptyStudioBoundaryRect: GBoundaryRect = { x: 0, y: 0, width: 1, height: 1 }

export function studioBoundaryRectForCoordinate(
  tree: GBoundaryTreeNode[] | undefined,
  coordinate: string,
): GBoundaryRect | undefined {
  if (!tree) return undefined

  const node = findStudioBoundaryNode(tree, coordinate)
  if (!node) return undefined

  return node.rect ?? emptyStudioBoundaryRect
}

export function findStudioBoundaryNode(tree: GBoundaryTreeNode[], coordinate: string): GBoundaryTreeNode | undefined {
  for (const node of tree) {
    if (node.coordinate === coordinate) return node
    const childMatch = findStudioBoundaryNode(node.children, coordinate)
    if (childMatch) return childMatch
  }

  return undefined
}
