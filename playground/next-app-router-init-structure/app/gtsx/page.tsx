import AppShell from "../../components/AppShell.g"

type GTSXPreviewPageProps = {
  searchParams?: Promise<{
    case?: string
  }>
}

export default async function GTSXPreviewPage(props: GTSXPreviewPageProps) {
  const searchParams = await props.searchParams
  const cases = AppShell.cases ?? {}
  const caseName = searchParams?.case

  if (!caseName) {
    return (
      <main style={{ display: "grid", gap: 24, padding: 24 }}>
        {Object.entries(cases).map(([name, testCase]) => (
          <section key={name} style={{ border: "1px solid #d0d7de", padding: 16 }}>
            <h2>{name}</h2>
            <AppShell {...testCase.props} />
          </section>
        ))}
      </main>
    )
  }

  const selectedCase = Object.entries(cases).find(([name]) => name === caseName)?.[1]

  if (!selectedCase) {
    return <main>Unknown GTSX case: {caseName}</main>
  }

  return <AppShell {...selectedCase.props} />
}
