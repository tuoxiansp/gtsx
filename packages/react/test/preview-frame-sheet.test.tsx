import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createGProvider, createGScopeHook } from "../src/index.js"
import {
  RunelightReactPreviewClient,
  RunelightReactPreviewFrameSheet,
  type RunelightReactPreviewComponent,
  type RunelightReactPreviewFrameSheetProps,
} from "../src/preview.js"

const PreviewForFrameSheetProps = (() => null) as RunelightReactPreviewComponent

const publicFrameSheetProps = {
  component: PreviewForFrameSheetProps,
  entry: "src/components/PublicPreview.g.tsx#default",
  selectedFrames: [],
} satisfies RunelightReactPreviewFrameSheetProps

void publicFrameSheetProps

const leakedFrameSheetProps = {
  component: PreviewForFrameSheetProps,
  entry: "src/components/PublicPreview.g.tsx#default",
  selectedFrames: [],
  // @ts-expect-error boundary collectors are internal to the preview client.
  boundaryCollector: null,
} satisfies RunelightReactPreviewFrameSheetProps

void leakedFrameSheetProps

describe("RunelightReactPreviewFrameSheet", () => {
  it("renders visible chrome as a Studio-style capture sheet", () => {
    const Preview = (() => <span>Ready preview</span>) as RunelightReactPreviewComponent
    Preview.frames = {
      ready: {
        description: "ready frame",
        props: {},
      },
      error: {
        description: "error frame",
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightReactPreviewFrameSheet
        component={Preview}
        entry="src/components/UserCard.g.tsx#default"
        selectedFrames={[
          { name: "ready", frame: Preview.frames!.ready },
          { name: "error", frame: Preview.frames!.error },
        ]}
      />,
    )

    expect(html).toContain('data-runelight-preview-contact-sheet="true"')
    expect(html).toContain("UserCard")
    expect(html).toContain("src/components/UserCard.g.tsx#default / 2 frames")
    expect(html).toContain('data-runelight-preview-frame-grid-scale="0.45"')
    expect(html).toContain("background-color:#181818")
    expect(html).toContain("transform:translateZ(0)")
    expect(html).toContain("ready")
  })

  it("keeps hidden chrome previews unwrapped for single-frame capture", () => {
    const Preview = (() => <span>Selected preview</span>) as RunelightReactPreviewComponent
    Preview.frames = {
      selected: {
        description: "selected frame",
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightReactPreviewFrameSheet
        component={Preview}
        entry="src/components/UserCard.g.tsx#default"
        selectedFrames={[{ name: "selected", frame: Preview.frames!.selected }]}
        showChrome={false}
      />,
    )

    expect(html).not.toContain("data-runelight-preview-contact-sheet")
    expect(html).not.toContain("runelight capture")
    expect(html).toContain('data-runelight-preview-capture-bounds="true"')
    expect(html).not.toContain("max-content")
    expect(html).toContain("Selected preview")
  })

  it("does not turn a missing frame scope into an undefined preview override", () => {
    const useChildScope = createGScopeHook(() => ({ label: "real child scope" }))

    function Child() {
      const scope = useChildScope()
      return <span>{scope.label}</span>
    }

    const Parent = (() => <Child />) as RunelightReactPreviewComponent
    Parent.frames = {
      ready: {
        description: "ready frame",
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightReactPreviewFrameSheet
        component={Parent}
        entry="src/Parent.g.tsx#default"
        selectedFrames={[{ name: "ready", frame: Parent.frames!.ready }]}
      />,
    )

    expect(html).toContain("real child scope")
  })

  it("makes frame providers available to the top-level preview component", () => {
    const MessageProvider = createGProvider((props: { value: string }) => [props.value, () => {}] as const)
    const useMessage = createGScopeHook(
      (_props: Record<string, never>, [message]: readonly [string]) => ({ message }),
      [MessageProvider] as const,
    )

    const Message = (() => {
      const scope = useMessage({})
      return <span>{scope.message}</span>
    }) as RunelightReactPreviewComponent
    Message.frames = {
      ready: {
        description: "ready frame",
        props: {},
        providers: [[MessageProvider, "frame provider value"]],
      },
    }

    const html = renderToStaticMarkup(
      <RunelightReactPreviewFrameSheet
        component={Message}
        entry="src/Message.g.tsx#default"
        selectedFrames={[{ name: "ready", frame: Message.frames!.ready }]}
      />,
    )

    expect(html).toContain("frame provider value")
  })

  it("accepts route params with poolMode when rendering a pooled preview host", () => {
    const html = renderToStaticMarkup(
      <RunelightReactPreviewClient
        poolMode
        entry={null}
        frameName={null}
        loadComponent={() => undefined}
      />,
    )

    expect(html).not.toContain("Missing entry")
  })
})
