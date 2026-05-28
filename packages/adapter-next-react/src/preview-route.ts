export type GTSXNextPreviewSearchParams = Record<string, string | string[] | undefined> | URLSearchParams | undefined

export type GTSXNextPreviewRouteProps = {
  caseName?: string | null
  caseOverrides?: Map<string, string>
  chrome?: string | null
  entry?: string | null
  pool?: string | null
  sessionId?: string | null
  staticMode?: boolean
}

export const gtsxNextPreviewPoolMailboxScriptId = "gtsx-preview-pool-mailbox"

export const GTSX_NEXT_PREVIEW_POOL_MAILBOX_SCRIPT = `(() => {
  if (window.__gtsxPreviewPrehydrationMailboxInstalled) return;
  window.__gtsxPreviewPrehydrationMailboxInstalled = true;
  const render = (target) => {
    window.__gtsxPreviewPendingRenderTarget = target;
    if (target && target.sessionId) {
      window.parent.postMessage({ type: "gtsx:render-accepted", protocolVersion: 1, sessionId: target.sessionId }, "*");
    }
    window.dispatchEvent(new CustomEvent("gtsx:preview-render-target", { detail: target }));
  };
  window.__gtsxPreviewRenderTargetMailbox = { render };
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.type !== "gtsx:render" || message.protocolVersion !== 1 || !message.target) return;
    render(message.target);
  });
  window.setTimeout(() => {
    window.parent.postMessage({ type: "gtsx:pool-ready", protocolVersion: 1 }, "*");
  }, 0);
})();`

export function readGTSXNextPreviewProps(searchParams: GTSXNextPreviewSearchParams): GTSXNextPreviewRouteProps {
  const params = searchParams instanceof URLSearchParams ? searchParams : searchParamsFromNextRecord(searchParams)

  return {
    caseName: params.get("case"),
    caseOverrides: readGTSXPreviewCaseOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    pool: params.get("pool"),
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

export function createGTSXNextPreviewPoolMailboxScriptProps(): {
  dangerouslySetInnerHTML: { __html: string }
  id: string
  strategy: "beforeInteractive"
} {
  return {
    dangerouslySetInnerHTML: {
      __html: GTSX_NEXT_PREVIEW_POOL_MAILBOX_SCRIPT,
    },
    id: gtsxNextPreviewPoolMailboxScriptId,
    strategy: "beforeInteractive",
  }
}

export function shouldInstallGTSXNextPreviewPoolMailbox(routeProps: Pick<GTSXNextPreviewRouteProps, "pool">): boolean {
  return routeProps.pool === "1"
}

function searchParamsFromNextRecord(searchParams: Record<string, string | string[] | undefined> | undefined): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }
  return params
}

function readGTSXPreviewCaseOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("gcase")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}
