import AppShell from "../../components/AppShell.g"

type GTSXPreviewPageProps = {
  searchParams?: Promise<{
    case?: string
  }>
}

export default async function GTSXPreviewPage(props: GTSXPreviewPageProps) {
  const searchParams = await props.searchParams
  const cases = AppShell.cases ?? {}
  const caseName = searchParams?.case ?? Object.keys(cases)[0]
  const selectedCase = caseName ? cases[caseName] : undefined

  if (!selectedCase) {
    return <main>Unknown GTSX case: {caseName}</main>
  }

  return <AppShell {...selectedCase.props} />
}
