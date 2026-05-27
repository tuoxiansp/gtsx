import { StudioShell } from "@gtsx/studio/client"
import { studioUrlSearchFromSearchParams } from "@gtsx/studio/manifest"

import { getStudioManifest } from "./studio-manifest"

type GTSXStudioPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function GTSXStudioPage(props: GTSXStudioPageProps) {
  const searchParams = await props.searchParams

  return (
    <StudioShell
      manifest={getStudioManifest()}
      urlSearch={studioUrlSearchFromSearchParams(searchParams)}
    />
  )
}
