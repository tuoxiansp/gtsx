import React from "react"

type PureCase<Props> = {
  props: Props
}

type PureComponent<Props = Record<string, unknown>> = React.ComponentType<Props> & {
  cases?: Record<string, PureCase<Props>>
}

type GTSXModule = {
  default: PureComponent
}

const modules = import.meta.glob<GTSXModule>("./cases/**/*.g.tsx")

export function GTSXPreviewApp() {
  const params = new URLSearchParams(window.location.search)
  const entry = params.get("entry")
  const caseName = params.get("case")

  if (!entry) {
    return <PreviewMessage title="Missing entry" detail="Pass ?entry=src/cases/.../*.g.tsx to render a GTSX example." />
  }

  return <GTSXEntryPreview entry={entry} caseName={caseName} />
}

function GTSXEntryPreview(props: { entry: string; caseName: string | null }) {
  const loader = modules[toModuleKey(props.entry)]

  if (!loader) {
    return <PreviewMessage title="Unknown entry" detail={props.entry} />
  }

  const LazyPreview = React.lazy(async () => {
    const moduleValue = await loader()
    return {
      default: () => <LoadedEntryPreview component={moduleValue.default} entry={props.entry} caseName={props.caseName} />,
    }
  })

  return (
    <React.Suspense fallback={<PreviewMessage title="Loading" detail={props.entry} />}>
      <LazyPreview />
    </React.Suspense>
  )
}

function LoadedEntryPreview(props: { component: PureComponent; entry: string; caseName: string | null }) {
  const cases = props.component.cases ?? {}
  const selectedCases = props.caseName ? [[props.caseName, cases[props.caseName]] as const] : Object.entries(cases)

  if (selectedCases.length === 0 || selectedCases.some(([, testCase]) => !testCase)) {
    return <PreviewMessage title="Unknown case" detail={props.caseName ?? "No cases declared"} />
  }

  const Component = props.component
  return (
    <main className="gtsx-contact-sheet">
      {selectedCases.map(([name, testCase]) => (
        <section className="gtsx-case-frame" key={name}>
          <header className="gtsx-case-label">
            <span>{props.entry}</span>
            <strong>{name}</strong>
          </header>
          <div className="gtsx-case-body">
            <Component {...testCase.props} />
          </div>
        </section>
      ))}
    </main>
  )
}

function PreviewMessage(props: { title: string; detail: string }) {
  return (
    <main className="gtsx-preview-message">
      <h1>{props.title}</h1>
      <p>{props.detail}</p>
    </main>
  )
}

function toModuleKey(entry: string): keyof typeof modules {
  return `./${entry.replace(/^src\//, "")}` as keyof typeof modules
}
