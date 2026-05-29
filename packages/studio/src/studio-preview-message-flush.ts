import type { GPreviewProtocolMessage } from "@gtsx/core"

import type { StudioPreviewFrameState } from "./client"

export type StudioPreviewMessageFlushItem = {
  message: GPreviewProtocolMessage
}

export type StudioPreviewMessageFlush<T extends StudioPreviewMessageFlushItem> = {
  completionMessages: T[]
  messagesToApply: T[]
}

export function createStudioPreviewMessageFlush<T extends StudioPreviewMessageFlushItem>(input: {
  getFrameState: (sessionId: string) => StudioPreviewFrameState | undefined
  messages: readonly T[]
}): StudioPreviewMessageFlush<T> {
  const completionKeysInBatch = new Set<string>()
  const completionMessages: T[] = []
  const messagesToApply: T[] = []

  for (const item of input.messages) {
    if (!isStudioPreviewCompletionMessage(item.message)) {
      messagesToApply.push(item)
      continue
    }

    const completionKey = studioPreviewCompletionMessageKey(item.message)
    if (completionKeysInBatch.has(completionKey)) continue
    completionKeysInBatch.add(completionKey)

    if (studioPreviewCompletionMessageAlreadyObserved(input.getFrameState(item.message.sessionId), item.message)) {
      continue
    }

    messagesToApply.push(item)
    completionMessages.push(item)
  }

  return { completionMessages, messagesToApply }
}

function isStudioPreviewCompletionMessage(
  message: GPreviewProtocolMessage,
): message is Extract<GPreviewProtocolMessage, { type: "gtsx:error" | "gtsx:ready" }> {
  return message.type === "gtsx:ready" || message.type === "gtsx:error"
}

function studioPreviewCompletionMessageAlreadyObserved(
  frameState: StudioPreviewFrameState | undefined,
  message: Extract<GPreviewProtocolMessage, { type: "gtsx:error" | "gtsx:ready" }>,
): boolean {
  if (!frameState) return false
  if (message.type === "gtsx:ready") return frameState.ready === true && !frameState.error

  return frameState.error?.message === message.error.message && frameState.error.stack === message.error.stack
}

function studioPreviewCompletionMessageKey(
  message: Extract<GPreviewProtocolMessage, { type: "gtsx:error" | "gtsx:ready" }>,
): string {
  if (message.type === "gtsx:ready") return `${message.sessionId}\n${message.type}`
  return `${message.sessionId}\n${message.type}\n${message.error.message}\n${message.error.stack ?? ""}`
}
