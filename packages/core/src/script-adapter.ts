export type ScriptAdapterParams = {
  cwd: string
  entry?: string
  frameName?: string
  frameOverrides?: string[]
  port?: string
  viewport?: string
  out?: string
  check?: boolean
}

export function expandCommand(template: string, params: ScriptAdapterParams): string {
  const replacements: Record<string, string> = {
    entry: params.entry ?? "",
    frame: params.frameName ?? "",
    frameOverride: params.frameOverrides?.join(",") ?? "",
    frameOverrides: params.frameOverrides?.map((frameOverride) => `--frame-override ${shellQuote(frameOverride)}`).join(" ") ?? "",
    port: params.port ?? "",
    viewport: params.viewport ?? "",
    out: params.out ?? "",
    check: params.check ? "true" : "false",
  }

  return template.replace(/\{([a-z]+)\}/g, (_match, key: string) => {
    if (key === "frameOverrides") return replacements.frameOverrides
    return shellQuote(replacements[key] ?? "")
  })
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]*$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}
