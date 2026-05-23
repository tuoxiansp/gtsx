import { StudioShell } from "gtsx/studio/client"
import { buildStudioManifest } from "gtsx/studio/server"

type GTSXStudioPageProps = {
  searchParams?: Promise<{
    selection?: string
  }>
}

export default async function GTSXStudioPage(props: GTSXStudioPageProps) {
  const searchParams = await props.searchParams

  return (
    <StudioShell
      manifest={buildStudioManifest({
        cwd: ".",
        projectRoot: "components",
      })}
      selection={searchParams?.selection}
    />
  )
}
