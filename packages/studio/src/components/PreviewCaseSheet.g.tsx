import type React from "react"
import { GPreviewProvider, type GBoundaryCollector, type GCases } from "gtsx"

export type PreviewCase<Props extends object = Record<string, unknown>> = {
  props: Props
  scope?: unknown
}

export type PreviewComponent<Props extends object = Record<string, unknown>> = React.ComponentType<Props> & {
  cases?: Record<string, PreviewCase<Props>>
}

export type PreviewRenderableCase<Props extends object = Record<string, unknown>> = {
  name: string
  testCase: PreviewCase<Props>
}

export type PreviewCaseSheetProps<Props extends object = Record<string, unknown>> = {
  boundaryCollector?: GBoundaryCollector
  caseOverrides?: Map<string, string>
  component: PreviewComponent<Props>
  entry: string
  selectedCases: PreviewRenderableCase<Props>[]
  showChrome?: boolean
}

export default function PreviewCaseSheet<Props extends object = Record<string, unknown>>(props: PreviewCaseSheetProps<Props>) {
  const Component = props.component

  return (
    <main style={{ display: "grid", gap: 16, padding: props.showChrome === false ? 0 : 24 }}>
      {props.selectedCases.map(({ name, testCase }) => (
        <section data-gtsx-preview-case={name} key={name}>
          {props.showChrome === false ? null : (
            <header
              style={{
                color: "#64748b",
                font: "12px ui-monospace, SFMono-Regular, Menlo, monospace",
                marginBottom: 8,
              }}
            >
              {props.entry} / {name}
            </header>
          )}
          <GPreviewProvider
            boundaryCollector={props.boundaryCollector}
            caseOverrides={caseOverridesForFrame(props.entry, name, props.caseOverrides ?? new Map())}
            scope={testCase.scope}
          >
            <Component {...testCase.props} />
          </GPreviewProvider>
        </section>
      ))}
    </main>
  )
}

type ExamplePreviewProps = {
  label: string
  tone: "neutral" | "selected"
}

function ExamplePreviewComponent(props: ExamplePreviewProps) {
  return (
    <article
      style={{
        background: props.tone === "selected" ? "#e0f2fe" : "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        color: "#172033",
        padding: 16,
      }}
    >
      {props.label}
    </article>
  )
}

PreviewCaseSheet.cases = {
  chromeVisible: {
    props: {
      component: ExamplePreviewComponent,
      entry: "src/components/ExamplePreview.g.tsx#default",
      selectedCases: [
        {
          name: "ready",
          testCase: {
            props: { label: "Ready preview", tone: "neutral" },
          },
        },
      ],
    },
  },
  chromeHidden: {
    props: {
      component: ExamplePreviewComponent,
      entry: "src/components/ExamplePreview.g.tsx#default",
      selectedCases: [
        {
          name: "selected",
          testCase: {
            props: { label: "Selected preview", tone: "selected" },
          },
        },
      ],
      showChrome: false,
    },
  },
} satisfies GCases<PreviewCaseSheetProps<ExamplePreviewProps>>

function caseOverridesForFrame(entry: string, caseName: string, childOverrides: Map<string, string>): Map<string, string> {
  return new Map([...childOverrides, [toComponentCoordinate(entry), caseName]])
}

function toComponentCoordinate(entry: string): string {
  return entry.includes("#") ? entry : `${entry}#default`
}
