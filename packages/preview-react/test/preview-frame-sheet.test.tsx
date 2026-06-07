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
