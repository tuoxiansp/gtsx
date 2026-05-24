import type { GBoundaryRect } from "./runtime.js"

const clippingOverflowValues = new Set(["auto", "clip", "hidden", "scroll"])

export function readGBoundaryElementRect(element: HTMLElement): GBoundaryRect | undefined {
  const ownRect = element.getBoundingClientRect()
  if (ownRect.width > 0 || ownRect.height > 0) return toBoundaryRect(ownRect)

  const childRects = renderedChildRects(element, element)
  if (childRects.length === 0) return undefined

  const left = Math.min(...childRects.map((rect) => rect.x))
  const top = Math.min(...childRects.map((rect) => rect.y))
  const right = Math.max(...childRects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...childRects.map((rect) => rect.y + rect.height))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function renderedChildRects(element: HTMLElement, boundaryElement: HTMLElement): GBoundaryRect[] {
  return [...element.children].flatMap((child) => {
    if (!isHTMLElement(child)) return []

    const rect = clipRectToBoundaryAncestors(toBoundaryRect(child.getBoundingClientRect()), child, boundaryElement)
    if (rect && (rect.width > 0 || rect.height > 0)) return [rect]

    return renderedChildRects(child, boundaryElement)
  })
}

function isHTMLElement(element: Element): element is HTMLElement {
  return typeof HTMLElement === "undefined" || element instanceof HTMLElement
}

function clipRectToBoundaryAncestors(
  rect: GBoundaryRect,
  element: HTMLElement,
  boundaryElement: HTMLElement,
): GBoundaryRect | undefined {
  let clippedRect: GBoundaryRect | undefined = rect

  for (let ancestor = element.parentElement; ancestor && ancestor !== boundaryElement; ancestor = ancestor.parentElement) {
    if (!clipsOverflow(ancestor)) continue

    clippedRect = intersectRects(clippedRect, toBoundaryRect(ancestor.getBoundingClientRect()))
    if (!clippedRect) return undefined
  }

  return clippedRect
}

function clipsOverflow(element: HTMLElement): boolean {
  const style = globalThis.getComputedStyle(element)
  return clippingOverflowValues.has(style.overflowX) || clippingOverflowValues.has(style.overflowY)
}

function intersectRects(left: GBoundaryRect, right: GBoundaryRect): GBoundaryRect | undefined {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const maxX = Math.min(left.x + left.width, right.x + right.width)
  const maxY = Math.min(left.y + left.height, right.y + right.height)

  if (maxX <= x || maxY <= y) return undefined

  return {
    x,
    y,
    width: maxX - x,
    height: maxY - y,
  }
}

function toBoundaryRect(rect: DOMRect): GBoundaryRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}
