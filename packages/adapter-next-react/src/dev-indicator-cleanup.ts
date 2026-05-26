type CleanupDocument = Document & {
  defaultView: (Window & typeof globalThis) | null
}

const cleanupStyleElementId = "gtsx-next-dev-indicator-cleanup"

export const nextDevIndicatorSelectors = [
  "#devtools-indicator",
  '[data-nextjs-toast][id="devtools-indicator"]',
  "#data-devtools-indicator",
  "#panel-route",
  "[data-nextjs-devtools]",
  "[data-nextjs-devtool]",
] as const

export type GTSXNextDevIndicatorCleanupOptions = {
  document?: Document
  location?: Pick<Location, "pathname">
  pathPrefix?: string
}

export function installGTSXNextDevIndicatorCleanup(options: GTSXNextDevIndicatorCleanupOptions = {}): () => void {
  const documentValue = options.document ?? globalThis.document
  if (!documentValue) return () => {}

  const syncCleanup = () => syncNextDevIndicatorCleanup(documentValue, options)
  const observer = createCleanupMutationObserver(documentValue, syncCleanup)
  const interval = globalThis.setInterval(syncCleanup, 250)

  syncCleanup()

  return () => {
    observer?.disconnect()
    globalThis.clearInterval(interval)
    restoreNextDevIndicator(documentValue)
  }
}

export function isGTSXNextPreviewPath(pathname: string, pathPrefix = "/gtsx"): boolean {
  const normalizedPrefix = pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix
  return pathname === normalizedPrefix || pathname.startsWith(`${normalizedPrefix}/`)
}

export function cleanupNextDevIndicator(documentValue: Document): void {
  hideNextDevIndicatorInRoot(documentValue)
  for (const portal of documentValue.querySelectorAll("nextjs-portal")) {
    const shadowRoot = portal.shadowRoot
    if (!shadowRoot) continue

    hideNextDevIndicatorInRoot(shadowRoot)
  }
}

export function restoreNextDevIndicator(documentValue: Document): void {
  removeDevIndicatorCleanupStyle(documentValue)
  for (const portal of documentValue.querySelectorAll("nextjs-portal")) {
    const shadowRoot = portal.shadowRoot
    if (shadowRoot) removeDevIndicatorCleanupStyle(shadowRoot)
  }
}

export function syncNextDevIndicatorCleanup(
  documentValue: Document,
  options: GTSXNextDevIndicatorCleanupOptions = {},
): void {
  const locationValue =
    options.location ?? (documentValue as CleanupDocument).defaultView?.location ?? globalThis.location
  if (isGTSXNextPreviewPath(locationValue?.pathname ?? "", options.pathPrefix)) {
    cleanupNextDevIndicator(documentValue)
  } else {
    restoreNextDevIndicator(documentValue)
  }
}

export function hideNextDevIndicatorInRoot(root: Document | ShadowRoot): boolean {
  return injectDevIndicatorCleanupStyle(root)
}

export function createNextDevIndicatorCleanupCss(): string {
  return `${nextDevIndicatorSelectors.join(",")} { display: none !important; pointer-events: none !important; }`
}

function injectDevIndicatorCleanupStyle(root: Document | ShadowRoot): boolean {
  if (root.getElementById(cleanupStyleElementId)) return false

  const styleContainer = styleRootFor(root)
  if (!styleContainer) return false

  const ownerDocument = "createElement" in root ? root : root.ownerDocument
  const styleElement = ownerDocument.createElement("style")
  styleElement.id = cleanupStyleElementId
  styleElement.textContent = createNextDevIndicatorCleanupCss()
  styleContainer.appendChild(styleElement)
  return true
}

function removeDevIndicatorCleanupStyle(root: Document | ShadowRoot): void {
  root.getElementById(cleanupStyleElementId)?.remove()
}

function styleRootFor(root: Document | ShadowRoot): HTMLElement | ShadowRoot | null {
  return "head" in root ? root.head : root
}

function createCleanupMutationObserver(documentValue: Document, cleanup: () => void): MutationObserver | undefined {
  if (typeof MutationObserver === "undefined") return undefined

  const observer = new MutationObserver(cleanup)
  observer.observe(documentValue.documentElement, {
    childList: true,
    subtree: true,
  })
  return observer
}
