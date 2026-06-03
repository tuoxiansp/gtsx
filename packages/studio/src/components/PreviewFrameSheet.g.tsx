import { type GFrames } from "@gtsx/core"
import {
  GTSXPreviewFrameSheet,
  type GTSXPreviewFrame,
  type GTSXPreviewFrameSheetProps,
  type GTSXPreviewComponent,
} from "@gtsx/preview-react"

export type PreviewFrame<Props extends object = Record<string, unknown>> = GTSXPreviewFrame<Props>

export type PreviewComponent<Props extends object = Record<string, unknown>> = GTSXPreviewComponent<Props>

export type PreviewRenderableFrame<Props extends object = Record<string, unknown>> = {
  name: string
  frame: PreviewFrame<Props>
}

export type PreviewFrameSheetProps<Props extends object = Record<string, unknown>> = GTSXPreviewFrameSheetProps<Props>

export default function PreviewFrameSheet<Props extends object = Record<string, unknown>>(props: PreviewFrameSheetProps<Props>) {
  return <GTSXPreviewFrameSheet {...props} />
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

PreviewFrameSheet.frames = {
  chromeVisible: {
    props: {
      component: ExamplePreviewComponent,
      entry: "src/components/ExamplePreview.g.tsx#default",
      selectedFrames: [
        {
          name: "ready",
          frame: {
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
      selectedFrames: [
        {
          name: "selected",
          frame: {
            props: { label: "Selected preview", tone: "selected" },
          },
        },
      ],
      showChrome: false,
    },
  },
} satisfies GFrames<PreviewFrameSheetProps<ExamplePreviewProps>>
