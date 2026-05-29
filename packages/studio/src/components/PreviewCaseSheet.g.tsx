import { type GCases } from "@gtsx/core"
import {
  GTSXPreviewCaseSheet,
  type GTSXPreviewCase,
  type GTSXPreviewCaseSheetProps,
  type GTSXPreviewComponent,
} from "@gtsx/preview-react"

export type PreviewCase<Props extends object = Record<string, unknown>> = GTSXPreviewCase<Props>

export type PreviewComponent<Props extends object = Record<string, unknown>> = GTSXPreviewComponent<Props>

export type PreviewRenderableCase<Props extends object = Record<string, unknown>> = {
  name: string
  testCase: PreviewCase<Props>
}

export type PreviewCaseSheetProps<Props extends object = Record<string, unknown>> = GTSXPreviewCaseSheetProps<Props>

export default function PreviewCaseSheet<Props extends object = Record<string, unknown>>(props: PreviewCaseSheetProps<Props>) {
  return <GTSXPreviewCaseSheet {...props} />
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
