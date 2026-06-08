import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createGProvider, createGScopeHook } from "@runelight/core"
import {
  RunelightReactPreviewClient,
  RunelightPreviewFrameSheet,
  applyRunelightPreviewRenderTargetRequest,
  createRunelightPreviewRenderTargetMailboxState,
  type RunelightPreviewComponent,
} from "../src/index.js"

describe("RunelightPreviewFrameSheet", () => {
  it("renders visible chrome as a Studio-style capture sheet", () => {
    const Preview = (() => <span>Ready preview</span>) as RunelightPreviewComponent
    Preview.frames = {
      ready: {
        props: {},
      },
      error: {
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightPreviewFrameSheet
        component={Preview}
        entry="src/components/UserCard.g.tsx#default"
        selectedFrames={[
          { name: "ready", frame: Preview.frames.ready },
          { name: "error", frame: Preview.frames.error },
        ]}
      />,
    )

    expect(html).toContain('data-runelight-preview-contact-sheet="true"')
    expect(html).toContain("UserCard")
    expect(html).toContain("src/components/UserCard.g.tsx#default / 2 frames")
    expect(html).toContain('data-runelight-preview-frame-grid-scale="0.45"')
    expect(html).toContain("background-color:#181818")
    expect(html).toContain("ready")
  })

  it("keeps hidden chrome previews unwrapped for single-frame capture", () => {
    const Preview = (() => <span>Selected preview</span>) as RunelightPreviewComponent
    Preview.frames = {
      selected: {
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightPreviewFrameSheet
        component={Preview}
        entry="src/components/UserCard.g.tsx#default"
        selectedFrames={[{ name: "selected", frame: Preview.frames.selected }]}
        showChrome={false}
      />,
    )

    expect(html).not.toContain("data-runelight-preview-contact-sheet")
    expect(html).not.toContain("runelight capture")
    expect(html).toContain("Selected preview")
  })

  it("does not turn a missing frame scope into an undefined preview override", () => {
    const useChildScope = createGScopeHook(() => ({ label: "real child scope" }))

    function Child() {
      const scope = useChildScope()
      return <span>{scope.label}</span>
    }

    const Parent = (() => <Child />) as RunelightPreviewComponent
    Parent.frames = {
      ready: {
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <RunelightPreviewFrameSheet
        component={Parent}
        entry="src/Parent.g.tsx#default"
        selectedFrames={[{ name: "ready", frame: Parent.frames.ready }]}
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
    }) as RunelightPreviewComponent
    Message.frames = {
      ready: {
        props: {},
        providers: [[MessageProvider, "frame provider value"]],
      },
    }

    const html = renderToStaticMarkup(
      <RunelightPreviewFrameSheet
        component={Message}
        entry="src/Message.g.tsx#default"
        selectedFrames={[{ name: "ready", frame: Message.frames.ready }]}
      />,
    )

    expect(html).toContain("frame provider value")
  })

  it("gives repeated acknowledged pool renders a fresh request identity", () => {
    const target = {
      frameName: "ready",
      chrome: "0",
      entry: "src/UserCard.g.tsx#default",
      sessionId: "src/UserCard.g.tsx#default:ready",
      staticMode: true,
    }
    const first = applyRunelightPreviewRenderTargetRequest(
      createRunelightPreviewRenderTargetMailboxState(null),
      target,
      { acknowledge: true },
    )
    const second = applyRunelightPreviewRenderTargetRequest(first.state, target, { acknowledge: true })
    const prehydrationDuplicate = applyRunelightPreviewRenderTargetRequest(second.state, target, { acknowledge: false })

    expect(first.shouldNotifySubscribers).toBe(true)
    expect(first.state.currentTarget?.renderRequestSequence).toBe(1)
    expect(second.shouldNotifySubscribers).toBe(true)
    expect(second.state.currentTarget?.renderRequestSequence).toBe(2)
    expect(prehydrationDuplicate.shouldNotifySubscribers).toBe(false)
    expect(prehydrationDuplicate.state.currentTarget?.renderRequestSequence).toBe(2)
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
