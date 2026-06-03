import AppShell from "../../components/AppShell.g"

type GTSXPreviewPageProps = {
  searchParams?: Promise<{
    frame?: string
  }>
}

export default async function GTSXPreviewPage(props: GTSXPreviewPageProps) {
  const searchParams = await props.searchParams
  const frames = AppShell.frames ?? {}
  const frameName = searchParams?.frame

  if (!frameName) {
    return (
      <main style={{ display: "grid", gap: 24, padding: 24 }}>
        {Object.entries(frames).map(([name, frame]) => (
          <section key={name} style={{ border: "1px solid #d0d7de", padding: 16 }}>
            <h2>{name}</h2>
            <AppShell {...frame.props} />
          </section>
        ))}
      </main>
    )
  }

  const selectedFrame = Object.entries(frames).find(([name]) => name === frameName)?.[1]

  if (!selectedFrame) {
    return <main>Unknown GTSX frame: {frameName}</main>
  }

  return <AppShell {...selectedFrame.props} />
}
