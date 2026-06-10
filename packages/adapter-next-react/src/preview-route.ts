import { RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT, runelightPreviewSsrBootstrapScriptId } from "@runelight/core/preview-protocol"
import { isRunelightNextRouteEnabled, type RunelightNextRouteEnablementOptions } from "./route-enablement.js"

export type RunelightNextPreviewSearchParams = Record<string, string | string[] | undefined> | URLSearchParams | undefined

export type RunelightNextPreviewRouteProps = {
  frameName?: string | null
  frameOverrides?: Map<string, string>
  chrome?: string | null
  entry?: string | null
  pool?: string | null
  sessionId?: string | null
  staticMode?: boolean
}

export type RunelightNextPreviewSsrScriptProps = {
  dangerouslySetInnerHTML: { __html: string }
  id: string
  strategy: "beforeInteractive"
}

/** @deprecated Use runelightPreviewSsrBootstrapScriptId from runelight/preview-protocol. */
export const runelightNextPreviewPoolMailboxScriptId = runelightPreviewSsrBootstrapScriptId

/** @deprecated Use RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT from runelight/preview-protocol. */
export const RUNELIGHT_NEXT_PREVIEW_POOL_MAILBOX_SCRIPT = RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT

export function readRunelightNextPreviewProps(searchParams: RunelightNextPreviewSearchParams): RunelightNextPreviewRouteProps {
  const params = searchParams instanceof URLSearchParams ? searchParams : searchParamsFromNextRecord(searchParams)

  return {
    frameName: params.get("frame"),
    frameOverrides: readRunelightPreviewFrameOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    pool: params.get("pool"),
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

export function isRunelightNextPreviewRouteEnabled(options: RunelightNextRouteEnablementOptions = {}): boolean {
  return isRunelightNextRouteEnabled(options)
}

export function createRunelightNextPreviewSsrScripts(
  routeProps: Pick<RunelightNextPreviewRouteProps, "pool">,
): RunelightNextPreviewSsrScriptProps[] {
  if (!shouldInstallRunelightNextPreviewSsrScripts(routeProps)) return []

  return [createRunelightNextPreviewSsrBootstrapScript()]
}

export function shouldInstallRunelightNextPreviewSsrScripts(routeProps: Pick<RunelightNextPreviewRouteProps, "pool">): boolean {
  return routeProps.pool === "1"
}

function createRunelightNextPreviewSsrBootstrapScript(): RunelightNextPreviewSsrScriptProps {
  return {
    dangerouslySetInnerHTML: {
      __html: RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
    },
    id: runelightPreviewSsrBootstrapScriptId,
    strategy: "beforeInteractive",
  }
}

/** @deprecated Use createRunelightNextPreviewSsrScripts. */
export function createRunelightNextPreviewPoolMailboxScriptProps(): RunelightNextPreviewSsrScriptProps {
  return createRunelightNextPreviewSsrBootstrapScript()
}

/** @deprecated Use shouldInstallRunelightNextPreviewSsrScripts. */
export function shouldInstallRunelightNextPreviewPoolMailbox(routeProps: Pick<RunelightNextPreviewRouteProps, "pool">): boolean {
  return shouldInstallRunelightNextPreviewSsrScripts(routeProps)
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

function readRunelightPreviewFrameOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("frameOverride")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}
