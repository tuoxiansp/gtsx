import {
  defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement,
  defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement,
  type StudioPreviewRenderQueueOptions,
  type StudioPreviewRenderQueueRunOptions,
} from "./preview-render-queue"

export type StudioPreviewRenderSchedulerRunOptions = {
  includeBuffer?: boolean
  useCanvasMovementRenderTaskLimit?: boolean
}

export type StudioPreviewRenderRequestPolicy = {
  renderBudget: "canvas-movement" | "normal"
  renderScope: "buffer" | "visible"
}

export const normalBufferedPreviewRenderRequestPolicy: StudioPreviewRenderRequestPolicy = {
  renderBudget: "normal",
  renderScope: "buffer",
}

export const normalVisiblePreviewRenderRequestPolicy: StudioPreviewRenderRequestPolicy = {
  renderBudget: "normal",
  renderScope: "visible",
}

export const movingCanvasBufferedPreviewRenderRequestPolicy: StudioPreviewRenderRequestPolicy = {
  renderBudget: "canvas-movement",
  renderScope: "buffer",
}

export function studioPreviewRenderQueueOptionsForRun(
  options: StudioPreviewRenderQueueOptions | undefined,
  runOptions: StudioPreviewRenderSchedulerRunOptions,
): StudioPreviewRenderQueueRunOptions | undefined {
  return studioPreviewRenderQueueOptionsForRequestPolicy(
    options,
    studioPreviewRenderRequestPolicyFromSchedulerRunOptions(runOptions),
  )
}

export function studioPreviewRenderQueueOptionsForRequestPolicy(
  options: StudioPreviewRenderQueueOptions | undefined,
  requestPolicy: StudioPreviewRenderRequestPolicy,
): StudioPreviewRenderQueueRunOptions | undefined {
  if (
    requestPolicy.renderScope === normalBufferedPreviewRenderRequestPolicy.renderScope &&
    requestPolicy.renderBudget === normalBufferedPreviewRenderRequestPolicy.renderBudget
  ) {
    return options
  }

  const nextOptions: StudioPreviewRenderQueueRunOptions = {
    ...options,
  }

  if (requestPolicy.renderScope === "visible") nextOptions.includeBufferedRenderTasks = false
  if (requestPolicy.renderBudget === "canvas-movement") {
    nextOptions.maximumConcurrentRenderTasks =
      options?.maximumConcurrentRenderTasksDuringCanvasMovement ??
      defaultStudioPreviewRenderQueueMaximumConcurrentRenderTasksDuringCanvasMovement
    nextOptions.minimumVisibleRenderTasks =
      options?.minimumVisibleRenderTasksDuringCanvasMovement ??
      defaultStudioPreviewRenderQueueMinimumVisibleRenderTasksDuringCanvasMovement
  }

  return nextOptions
}

export function mergeStudioPreviewRenderSchedulerRunOptions(
  currentOptions: StudioPreviewRenderSchedulerRunOptions | null,
  nextOptions: StudioPreviewRenderSchedulerRunOptions,
): StudioPreviewRenderSchedulerRunOptions {
  const currentPolicy = currentOptions ? studioPreviewRenderRequestPolicyFromSchedulerRunOptions(currentOptions) : null
  const nextPolicy = studioPreviewRenderRequestPolicyFromSchedulerRunOptions(nextOptions)
  return studioPreviewRenderSchedulerRunOptionsFromRequestPolicy(mergeStudioPreviewRenderRequestPolicies(currentPolicy, nextPolicy))
}

export function mergeStudioPreviewRenderRequestPolicies(
  currentPolicy: StudioPreviewRenderRequestPolicy | null,
  nextPolicy: StudioPreviewRenderRequestPolicy,
): StudioPreviewRenderRequestPolicy {
  if (!currentPolicy) return nextPolicy
  return {
    renderBudget:
      currentPolicy.renderBudget === "canvas-movement" && nextPolicy.renderBudget === "canvas-movement"
        ? "canvas-movement"
        : "normal",
    renderScope: currentPolicy.renderScope === "buffer" || nextPolicy.renderScope === "buffer" ? "buffer" : "visible",
  }
}

export function studioPreviewRenderRequestPolicyFromSchedulerRunOptions(
  options: StudioPreviewRenderSchedulerRunOptions,
): StudioPreviewRenderRequestPolicy {
  return {
    renderBudget: options.useCanvasMovementRenderTaskLimit === true ? "canvas-movement" : "normal",
    renderScope: options.includeBuffer === false ? "visible" : "buffer",
  }
}

export function studioPreviewRenderSchedulerRunOptionsFromRequestPolicy(
  requestPolicy: StudioPreviewRenderRequestPolicy,
): StudioPreviewRenderSchedulerRunOptions {
  return {
    includeBuffer: requestPolicy.renderScope === "buffer",
    useCanvasMovementRenderTaskLimit: requestPolicy.renderBudget === "canvas-movement",
  }
}
