import { StudioShell } from "gtsx/studio/client"
import { buildStudioManifest } from "gtsx/studio/server"

type GTSXStudioPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXStudioPage(props: GTSXStudioPageProps) {
  const searchParams = await props.searchParams

  return (
    <StudioShell
      manifest={buildStudioManifest({
        cwd: ".",
        projectRoot: "components",
      })}
      selection={typeof searchParams?.selection === "string" ? searchParams.selection : undefined}
      urlSearch={studioUrlSearch(searchParams)}
    />
  )
}

function studioUrlSearch(searchParams: Record<string, string | string[] | undefined> | undefined): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value) {
      params.set(key, value)
    }
  }
  return params.toString()
}
