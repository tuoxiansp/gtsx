import {
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
  RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID,
  readRunelightPreviewFrameOverridesFromSearchParams,
} from "@runelight/core/preview-protocol"
import type { RunelightConfig } from "@runelight/core"
import { isRunelightNextRouteEnabled } from "./route-enablement.js"

export type RunelightNextPreviewSearchParams = Record<string, string | string[] | undefined> | URLSearchParams | undefined

export type RunelightNextPreviewRouteOptions = {
  config?: RunelightConfig
  cwd?: string
}

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

export function isRunelightNextPreviewRouteEnabled(options: RunelightNextPreviewRouteOptions = {}): boolean {
  return isRunelightNextRouteEnabled(options)
}

export function createRunelightNextPreviewSsrScripts(
  routeProps: Pick<RunelightNextPreviewRouteProps, "pool">,
): RunelightNextPreviewSsrScriptProps[] {
  if (!shouldInstallRunelightNextPreviewSsrScripts(routeProps)) return []

  return [createRunelightNextPreviewSsrBootstrapScript()]
}

function shouldInstallRunelightNextPreviewSsrScripts(routeProps: Pick<RunelightNextPreviewRouteProps, "pool">): boolean {
  return routeProps.pool === "1"
}

function createRunelightNextPreviewSsrBootstrapScript(): RunelightNextPreviewSsrScriptProps {
  return {
    dangerouslySetInnerHTML: {
      __html: RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT,
    },
    id: RUNELIGHT_PREVIEW_SSR_BOOTSTRAP_SCRIPT_ID,
    strategy: "beforeInteractive",
  }
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
  return readRunelightPreviewFrameOverridesFromSearchParams(params)
}
