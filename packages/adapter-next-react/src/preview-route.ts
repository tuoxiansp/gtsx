import { GTSX_PREVIEW_SSR_BOOTSTRAP_SCRIPT, gtsxPreviewSsrBootstrapScriptId } from "@gtsx/core/preview-protocol"

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

export type GTSXNextPreviewSsrScriptProps = {
  dangerouslySetInnerHTML: { __html: string }
  id: string
  strategy: "beforeInteractive"
}

/** @deprecated Use gtsxPreviewSsrBootstrapScriptId from gtsx/preview-protocol. */
export const gtsxNextPreviewPoolMailboxScriptId = gtsxPreviewSsrBootstrapScriptId

/** @deprecated Use GTSX_PREVIEW_SSR_BOOTSTRAP_SCRIPT from gtsx/preview-protocol. */
export const GTSX_NEXT_PREVIEW_POOL_MAILBOX_SCRIPT = GTSX_PREVIEW_SSR_BOOTSTRAP_SCRIPT

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

export function createGTSXNextPreviewSsrScripts(
  routeProps: Pick<GTSXNextPreviewRouteProps, "pool">,
): GTSXNextPreviewSsrScriptProps[] {
  if (!shouldInstallGTSXNextPreviewSsrScripts(routeProps)) return []

  return [createGTSXNextPreviewSsrBootstrapScript()]
}

export function shouldInstallGTSXNextPreviewSsrScripts(routeProps: Pick<GTSXNextPreviewRouteProps, "pool">): boolean {
  return routeProps.pool === "1"
}

function createGTSXNextPreviewSsrBootstrapScript(): GTSXNextPreviewSsrScriptProps {
  return {
    dangerouslySetInnerHTML: {
      __html: GTSX_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
    },
    id: gtsxPreviewSsrBootstrapScriptId,
    strategy: "beforeInteractive",
  }
}

/** @deprecated Use createGTSXNextPreviewSsrScripts. */
export function createGTSXNextPreviewPoolMailboxScriptProps(): GTSXNextPreviewSsrScriptProps {
  return createGTSXNextPreviewSsrBootstrapScript()
}

/** @deprecated Use shouldInstallGTSXNextPreviewSsrScripts. */
export function shouldInstallGTSXNextPreviewPoolMailbox(routeProps: Pick<GTSXNextPreviewRouteProps, "pool">): boolean {
  return shouldInstallGTSXNextPreviewSsrScripts(routeProps)
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
