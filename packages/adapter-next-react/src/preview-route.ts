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
