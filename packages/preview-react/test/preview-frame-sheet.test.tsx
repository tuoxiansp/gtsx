import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { createGProvider, createGScopeHook } from "@gtsx/core"
import {
  GTSXPreviewFrameSheet,
  applyGTSXPreviewRenderTargetRequest,
  createGTSXPreviewRenderTargetMailboxState,
  type GTSXPreviewComponent,
} from "../src/index.js"

describe("GTSXPreviewFrameSheet", () => {
  it("does not turn a missing frame scope into an undefined preview override", () => {
    const useChildScope = createGScopeHook(() => ({ label: "real child scope" }))

    function Child() {
      const scope = useChildScope()
      return <span>{scope.label}</span>
    }

    const Parent = (() => <Child />) as GTSXPreviewComponent
    Parent.frames = {
      ready: {
        props: {},
      },
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewFrameSheet
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
    }) as GTSXPreviewComponent
    Message.frames = {
      ready: {
        props: {},
        providers: [[MessageProvider, "frame provider value"]],
      },
    }

    const html = renderToStaticMarkup(
      <GTSXPreviewFrameSheet
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
    const first = applyGTSXPreviewRenderTargetRequest(
      createGTSXPreviewRenderTargetMailboxState(null),
      target,
      { acknowledge: true },
    )
    const second = applyGTSXPreviewRenderTargetRequest(first.state, target, { acknowledge: true })
    const prehydrationDuplicate = applyGTSXPreviewRenderTargetRequest(second.state, target, { acknowledge: false })

    expect(first.shouldNotifySubscribers).toBe(true)
    expect(first.state.currentTarget?.renderRequestSequence).toBe(1)
    expect(second.shouldNotifySubscribers).toBe(true)
    expect(second.state.currentTarget?.renderRequestSequence).toBe(2)
    expect(prehydrationDuplicate.shouldNotifySubscribers).toBe(false)
    expect(prehydrationDuplicate.state.currentTarget?.renderRequestSequence).toBe(2)
  })
})
