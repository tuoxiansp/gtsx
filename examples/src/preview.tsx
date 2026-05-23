import React from "react"

import { GPreviewProvider } from "gtsx"

type PreviewCase<Props> = {
  props: Props
  scope?: unknown
}

type PreviewComponent<Props = Record<string, unknown>> = React.ComponentType<Props> & {
  cases?: Record<string, PreviewCase<Props>>
}

type GTSXModule = Record<string, unknown> & {
  default: PreviewComponent
}

const modules = import.meta.glob<GTSXModule>("./cases/**/*.g.tsx")

export function GTSXPreviewApp() {
  const params = new URLSearchParams(window.location.search)
  const entry = params.get("entry")
  const caseName = params.get("case")
  const caseOverrides = readCaseOverrides(params)

  if (!entry) {
    return <PreviewMessage title="Missing entry" detail="Pass ?entry=src/cases/.../*.g.tsx to render a GTSX example." />
  }

  return <GTSXEntryPreview entry={entry} caseName={caseName} caseOverrides={caseOverrides} />
}

function GTSXEntryPreview(props: { entry: string; caseName: string | null; caseOverrides: Map<string, string> }) {
  const entryCoordinate = parseEntryCoordinate(props.entry)
  const loader = modules[toModuleKey(entryCoordinate.file)]

  if (!loader) {
    return <PreviewMessage title="Unknown entry" detail={props.entry} />
  }

  const LazyPreview = React.lazy(async () => {
    const moduleValue = await loader()
    const component = moduleValue[entryCoordinate.exportName]
    if (!isPreviewComponent(component)) {
      return {
        default: () => <PreviewMessage title="Unknown component export" detail={props.entry} />,
      }
    }

    return {
      default: () => (
        <LoadedEntryPreview
          component={component}
          entry={props.entry}
          caseName={props.caseName}
          caseOverrides={props.caseOverrides}
        />
      ),
    }
  })

  return (
    <React.Suspense fallback={<PreviewMessage title="Loading" detail={props.entry} />}>
      <LazyPreview />
    </React.Suspense>
  )
}

function LoadedEntryPreview(props: {
  component: PreviewComponent
  entry: string
  caseName: string | null
  caseOverrides: Map<string, string>
}) {
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
            <GPreviewProvider scope={testCase.scope} caseOverrides={caseOverridesForFrame(props.entry, name, props.caseOverrides)}>
              <Component {...testCase.props} />
            </GPreviewProvider>
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

function toModuleKey(entryFile: string): keyof typeof modules {
  return `./${entryFile.replace(/^src\//, "")}` as keyof typeof modules
}

function readCaseOverrides(params: URLSearchParams): Map<string, string> {
  const overrides = new Map<string, string>()
  for (const value of params.getAll("gcase")) {
    const separatorIndex = value.lastIndexOf(":")
    if (separatorIndex > 0) {
      overrides.set(value.slice(0, separatorIndex), value.slice(separatorIndex + 1))
    }
  }
  return overrides
}

function caseOverridesForFrame(entry: string, caseName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), caseName]])
}

function toComponentCoordinate(entry: string): string {
  return entry.includes("#") ? entry : `${entry}#default`
}

function parseEntryCoordinate(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file, exportName: exportName || "default" }
}

function isPreviewComponent(value: unknown): value is PreviewComponent {
  return typeof value === "function"
}
