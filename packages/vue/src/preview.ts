import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  watch,
  type Component,
  type InjectionKey,
  type PropType,
  type Ref,
} from "vue"

import {
  createGPreviewErrorMessage,
  createGPreviewPoolReadyMessage,
  createGPreviewReadyMessage,
  createGPreviewRenderAcceptedMessage,
  createGPreviewResizeMessage,
  createGPreviewTreeMessage,
  createGPreviewValuesMessage,
  isGPreviewRenderMessage,
  isGPreviewRenderTarget,
  readRunelightPreviewFrameOverridesFromSearchParams,
  type GBoundaryTreeNode,
  type GPreviewRenderTarget,
  type GPreviewSessionMessage,
  type GRuntimeValuesSnapshot,
} from "@runelight/core/preview-protocol"

export type RunelightVuePreviewProviderEntry = readonly [InjectionKey<any> | string, unknown]

export type RunelightVuePreviewFrame<Props extends object = Record<string, unknown>> = {
  props?: Props
  scope?: Record<string, unknown>
  providers?: readonly RunelightVuePreviewProviderEntry[]
}

export type RunelightVuePreviewComponent<Props extends object = Record<string, unknown>> = Component & {
  frames?: Record<string, RunelightVuePreviewFrame<Props>>
}

export type RunelightVuePreviewModule = Record<string, unknown>

export type RunelightVuePreviewComponentLoader = (entry: string) =>
  | RunelightVuePreviewComponent
  | Promise<RunelightVuePreviewComponent | undefined>
  | undefined

export type RunelightVuePreviewRouteParams = {
  frameName: string | null
  frameOverrides: Map<string, string>
  chrome: string | null
  entry: string | null
  poolMode: boolean
  renderRequestSequence: number
  sessionId: string | null
  staticMode: boolean
}

type LoadedRunelightVuePreviewEntry = {
  component: RunelightVuePreviewComponent | null
  entry: string
}

type RunelightVueFrameContextValue = Ref<RunelightVuePreviewFrame>

const RunelightVueFrameSymbol = Symbol("runelight-vue-frame")
const loadedRunelightVuePreviewEntriesByLoader = new WeakMap<RunelightVuePreviewComponentLoader, Map<string, LoadedRunelightVuePreviewEntry>>()
const loadingRunelightVuePreviewEntriesByLoader = new WeakMap<
  RunelightVuePreviewComponentLoader,
  Map<string, Promise<LoadedRunelightVuePreviewEntry>>
>()

export const RunelightVuePreviewClient = defineComponent({
  name: "RunelightVuePreviewClient",
  props: {
    chrome: { type: [Boolean, String, null] as PropType<boolean | string | null>, default: null },
    defaultEntry: { type: String, default: undefined },
    entry: { type: [String, null] as PropType<string | null>, default: null },
    frameName: { type: [String, null] as PropType<string | null>, default: null },
    frameOverrides: { type: Object as PropType<Map<string, string>>, default: () => new Map<string, string>() },
    loadComponent: { type: Function as PropType<RunelightVuePreviewComponentLoader>, required: true },
    missingEntryDetail: {
      type: String,
      default: "Pass ?entry=src/components/.../*.g.vue to render a Runelight Vue preview.",
    },
    pool: { type: [Boolean, String, null] as PropType<boolean | string | null>, default: null },
    poolMode: { type: Boolean, default: false },
    renderRequestSequence: { type: Number, default: 0 },
    sessionId: { type: [String, null] as PropType<string | null>, default: null },
    staticMode: { type: Boolean, default: false },
  },
  setup(props) {
    const routeTarget = computed<RunelightVuePreviewRouteParams>(() => ({
      frameName: props.frameName,
      frameOverrides: props.frameOverrides,
      chrome: typeof props.chrome === "boolean" ? (props.chrome ? "1" : "0") : props.chrome,
      entry: props.entry ?? props.defaultEntry ?? null,
      poolMode: typeof props.pool === "boolean" ? props.pool : props.pool === "1" || props.poolMode,
      renderRequestSequence: 0,
      sessionId: props.sessionId,
      staticMode: props.staticMode,
    }))
    const renderTarget = useRunelightVuePreviewRenderTarget(routeTarget)
    const showChrome = computed(() => showChromeForPreviewTarget(renderTarget.value.chrome))

    return () => {
      if (!renderTarget.value.entry) {
        if (renderTarget.value.poolMode) return h(RunelightVuePreviewDocumentBackground, { showChrome: false })
        return [
          h(RunelightVuePreviewDocumentBackground, { showChrome: showChrome.value }),
          h(RunelightVuePreviewMessage, {
            detail: props.missingEntryDetail,
            sessionId: renderTarget.value.sessionId,
            title: "Missing entry",
          }),
        ]
      }

      return [
        h(RunelightVuePreviewDocumentBackground, { showChrome: showChrome.value }),
        h(RunelightVueEntryPreview, {
          key: previewRenderTargetKey(renderTarget.value),
          componentLoader: props.loadComponent,
          entry: renderTarget.value.entry,
          frameName: renderTarget.value.frameName,
          frameOverrides: renderTarget.value.frameOverrides,
          sessionId: renderTarget.value.sessionId,
          showChrome: showChrome.value,
          staticMode: renderTarget.value.staticMode,
        }),
      ]
    }
  },
})

const RunelightVueEntryPreview = defineComponent({
  name: "RunelightVueEntryPreview",
  props: {
    componentLoader: { type: Function as PropType<RunelightVuePreviewComponentLoader>, required: true },
    entry: { type: String, required: true },
    frameName: { type: [String, null] as PropType<string | null>, default: null },
    frameOverrides: { type: Object as PropType<Map<string, string>>, required: true },
    sessionId: { type: [String, null] as PropType<string | null>, default: null },
    showChrome: { type: Boolean, required: true },
    staticMode: { type: Boolean, required: true },
  },
  setup(props) {
    const loadedEntry = shallowRef(readLoadedRunelightVuePreviewEntry(props.componentLoader, props.entry))

    watch(
      () => [props.componentLoader, props.entry] as const,
      async ([loader, entry], _previous, onCleanup) => {
        const cached = readLoadedRunelightVuePreviewEntry(loader, entry)
        if (cached) {
          loadedEntry.value = cached
          return
        }

        let ignore = false
        onCleanup(() => {
          ignore = true
        })
        const loaded = await loadRunelightVuePreviewEntry(loader, entry)
        if (!ignore) loadedEntry.value = loaded
      },
      { immediate: true },
    )

    return () => {
      if (!loadedEntry.value || loadedEntry.value.entry !== props.entry) {
        return props.showChrome ? h(RunelightVuePreviewMessage, { detail: props.entry, title: "Loading" }) : null
      }

      if (!loadedEntry.value.component) {
        return h(RunelightVuePreviewMessage, {
          detail: props.entry,
          sessionId: props.sessionId,
          title: "Unknown Runelight entry",
        })
      }

      return h(RunelightVueLoadedEntryPreview, {
        component: loadedEntry.value.component,
        entry: props.entry,
        frameName: props.frameName,
        frameOverrides: props.frameOverrides,
        sessionId: props.sessionId,
        showChrome: props.showChrome,
        staticMode: props.staticMode,
      })
    }
  },
})

const RunelightVueLoadedEntryPreview = defineComponent({
  name: "RunelightVueLoadedEntryPreview",
  props: {
    component: { type: Object as PropType<RunelightVuePreviewComponent>, required: true },
    entry: { type: String, required: true },
    frameName: { type: [String, null] as PropType<string | null>, default: null },
    frameOverrides: { type: Object as PropType<Map<string, string>>, required: true },
    sessionId: { type: [String, null] as PropType<string | null>, default: null },
    showChrome: { type: Boolean, required: true },
    staticMode: { type: Boolean, required: true },
  },
  setup(props) {
    const frames = computed(() => props.component.frames ?? {})
    const selectedFrames = computed(() =>
      props.frameName ? [[props.frameName, frames.value[props.frameName]] as const] : Object.entries(frames.value),
    )
    const renderableFrames = computed(() => selectedFrames.value.flatMap(([name, frame]) => (frame ? [{ name, frame }] : [])))
    const enabled = computed(() => selectedFrames.value.length > 0 && renderableFrames.value.length === selectedFrames.value.length)

    useRunelightVuePreviewProtocolMessages(props.sessionId, enabled, { staticMode: props.staticMode })

    return () => {
      if (!enabled.value) {
        return h(RunelightVuePreviewMessage, {
          detail: props.frameName ?? "No frames declared",
          sessionId: props.sessionId,
          title: "Unknown Runelight frame",
        })
      }

      return h(
        "main",
        {
          style: {
            display: "grid",
            gap: "16px",
            minHeight: props.showChrome ? "100vh" : undefined,
            padding: props.showChrome ? "24px" : 0,
          },
        },
        renderableFrames.value.map(({ name, frame }) =>
          h(
            "section",
            { "data-runelight-preview-frame": name, key: name },
            [
              props.showChrome
                ? h(
                    "header",
                    {
                      style: {
                        color: "#64748b",
                        font: "12px ui-monospace, SFMono-Regular, Menlo, monospace",
                        marginBottom: "8px",
                      },
                    },
                    `${props.entry} / ${name}`,
                  )
                : null,
              h(RunelightVueFrameProvider, { component: props.component, entry: props.entry, frame, frameName: name }),
            ],
          ),
        ),
      )
    }
  },
})

const RunelightVueFrameProvider = defineComponent({
  name: "RunelightVueFrameProvider",
  props: {
    component: { type: Object as PropType<RunelightVuePreviewComponent>, required: true },
    entry: { type: String, required: true },
    frame: { type: Object as PropType<RunelightVuePreviewFrame>, required: true },
    frameName: { type: String, required: true },
  },
  setup(props) {
    const frameRef = shallowRef(props.frame)
    provide(RunelightVueFrameSymbol, frameRef)
    for (const [key, value] of runelightVuePreviewFrameProviderEntries(props.frame)) {
      provide(key, value)
    }
    return () => {
      const boundaryId = `runelight-boundary:${props.entry}:${props.frameName}`
      return h(
        "div",
        {
          "data-runelight-boundary-id": boundaryId,
          "data-runelight-boundary-coordinate": props.entry,
          style: { display: "contents" },
        },
        [h(props.component, props.frame.props ?? {})],
      )
    }
  },
})

function runelightVuePreviewFrameProviderEntries(frame: RunelightVuePreviewFrame): readonly RunelightVuePreviewProviderEntry[] {
  return frame.providers ?? []
}

export function useRunelightVueFrame(): Ref<RunelightVuePreviewFrame> {
  return inject<RunelightVueFrameContextValue>(RunelightVueFrameSymbol, ref({}))
}

const RunelightVuePreviewDocumentBackground = defineComponent({
  name: "RunelightVuePreviewDocumentBackground",
  props: {
    showChrome: { type: Boolean, required: true },
  },
  setup(props) {
    return () => (props.showChrome ? null : h("style", "html, body { background: transparent !important; }"))
  },
})

const RunelightVuePreviewMessage = defineComponent({
  name: "RunelightVuePreviewMessage",
  props: {
    detail: { type: String, required: true },
    sessionId: { type: [String, null] as PropType<string | null>, default: null },
    title: { type: String, required: true },
  },
  setup(props) {
    onMounted(() => {
      if (props.sessionId) {
        window.parent.postMessage(createGPreviewErrorMessage(props.sessionId, new Error(`${props.title}: ${props.detail}`)), "*")
      }
    })

    return () =>
      h(
        "main",
        {
          "data-runelight-preview-message": "true",
          style: {
            color: "#172033",
            display: "grid",
            gap: "8px",
            padding: "24px",
          },
        },
        [
          h("h1", { style: { fontSize: "18px", fontWeight: 700 } }, props.title),
          h("p", { style: { color: "#64748b", fontSize: "14px" } }, props.detail),
        ],
      )
  },
})

export function readRunelightVuePreviewRouteParams(params: URLSearchParams): RunelightVuePreviewRouteParams {
  return {
    frameName: params.get("frame"),
    frameOverrides: readRunelightVuePreviewFrameOverrides(params),
    chrome: params.get("chrome"),
    entry: params.get("entry"),
    poolMode: params.get("pool") === "1",
    renderRequestSequence: 0,
    sessionId: params.get("sessionId"),
    staticMode: params.get("static") === "1",
  }
}

export function parseRunelightVuePreviewEntry(entry: string): { file: string; exportName: string } {
  const [file, exportName] = entry.split("#", 2)
  return { file: file ?? entry, exportName: exportName || "default" }
}

export function isRunelightVuePreviewComponent(value: unknown): value is RunelightVuePreviewComponent {
  return typeof value === "object" && value !== null
}

function readLoadedRunelightVuePreviewEntry(
  loadComponent: RunelightVuePreviewComponentLoader,
  entry: string,
): LoadedRunelightVuePreviewEntry | null {
  return loadedRunelightVuePreviewEntriesByLoader.get(loadComponent)?.get(entry) ?? null
}

function loadRunelightVuePreviewEntry(
  loadComponent: RunelightVuePreviewComponentLoader,
  entry: string,
): Promise<LoadedRunelightVuePreviewEntry> {
  let loadedEntries = loadedRunelightVuePreviewEntriesByLoader.get(loadComponent)
  if (!loadedEntries) {
    loadedEntries = new Map()
    loadedRunelightVuePreviewEntriesByLoader.set(loadComponent, loadedEntries)
  }

  const loadedEntry = loadedEntries.get(entry)
  if (loadedEntry) return Promise.resolve(loadedEntry)

  let loadingEntries = loadingRunelightVuePreviewEntriesByLoader.get(loadComponent)
  if (!loadingEntries) {
    loadingEntries = new Map()
    loadingRunelightVuePreviewEntriesByLoader.set(loadComponent, loadingEntries)
  }

  const loadingEntry = loadingEntries.get(entry)
  if (loadingEntry) return loadingEntry

  const nextLoadingEntry = Promise.resolve(loadComponent(entry))
    .then((component) => ({ component: component ?? null, entry }))
    .catch(() => ({ component: null, entry }))
    .then((loaded) => {
      loadedEntries.set(entry, loaded)
      loadingEntries.delete(entry)
      return loaded
    })
  loadingEntries.set(entry, nextLoadingEntry)
  return nextLoadingEntry
}

type RunelightVuePreviewRenderTargetSubscriber = (target: RunelightVuePreviewRouteParams) => void

type RunelightVuePreviewRenderTargetMailbox = {
  announcePoolReady: () => void
  getTarget: () => RunelightVuePreviewRouteParams | null
  render: (target: GPreviewRenderTarget) => void
  subscribe: (subscriber: RunelightVuePreviewRenderTargetSubscriber) => () => void
}

type RunelightVuePreviewMailboxWindow = Window &
  typeof globalThis & {
    __runelightPreviewPendingRenderTarget?: GPreviewRenderTarget
    __runelightPreviewPrehydrationMailboxInstalled?: boolean
    __runelightPreviewRenderTargetMailbox?: Pick<RunelightVuePreviewRenderTargetMailbox, "render">
  }

function readRunelightVuePreviewMailboxWindow(): RunelightVuePreviewMailboxWindow | null {
  return typeof window === "undefined" ? null : (window as RunelightVuePreviewMailboxWindow)
}

let runelightVuePreviewRenderTargetMailbox: RunelightVuePreviewRenderTargetMailbox | null = null

function useRunelightVuePreviewRenderTarget(routeTarget: Ref<RunelightVuePreviewRouteParams>): Ref<RunelightVuePreviewRouteParams> {
  const target = shallowRef(routeTarget.value)
  let unsubscribe: (() => void) | undefined

  onMounted(() => {
    if (!routeTarget.value.poolMode) {
      target.value = routeTarget.value
      return
    }

    const mailbox = ensureRunelightVuePreviewRenderTargetMailbox()
    if (!mailbox) return

    unsubscribe = mailbox.subscribe((nextTarget) => {
      target.value = nextTarget
    })
    mailbox.announcePoolReady()
    const current = mailbox.getTarget()
    if (current) target.value = current
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
  })

  watch(routeTarget, (nextTarget) => {
    if (!nextTarget.poolMode) target.value = nextTarget
  })

  return target
}

function ensureRunelightVuePreviewRenderTargetMailbox(): RunelightVuePreviewRenderTargetMailbox | null {
  const mailboxWindow = readRunelightVuePreviewMailboxWindow()
  if (!mailboxWindow) return null
  if (runelightVuePreviewRenderTargetMailbox) return runelightVuePreviewRenderTargetMailbox

  const subscribers = new Set<RunelightVuePreviewRenderTargetSubscriber>()
  let currentTarget = mailboxWindow.__runelightPreviewPendingRenderTarget
    ? previewRouteParamsFromRenderTarget(mailboxWindow.__runelightPreviewPendingRenderTarget, 0)
    : null
  let renderRequestSequence = 0
  let poolReadyAnnounced = false

  const render = (target: GPreviewRenderTarget) => {
    mailboxWindow.__runelightPreviewPendingRenderTarget = target
    if (target.sessionId) {
      mailboxWindow.parent.postMessage(createGPreviewRenderAcceptedMessage(target.sessionId), "*")
    }
    renderRequestSequence += 1
    currentTarget = previewRouteParamsFromRenderTarget(target, renderRequestSequence)
    for (const subscriber of subscribers) subscriber(currentTarget)
  }

  mailboxWindow.__runelightPreviewRenderTargetMailbox = { render }
  if (mailboxWindow.__runelightPreviewPrehydrationMailboxInstalled) {
    mailboxWindow.addEventListener("runelight:preview-render-target", (event) => {
      const target = (event as CustomEvent<GPreviewRenderTarget>).detail
      if (isGPreviewRenderTarget(target)) render(target)
    })
  } else {
    mailboxWindow.addEventListener("message", (event: MessageEvent) => {
      if (isGPreviewRenderMessage(event.data)) render(event.data.target)
    })
  }

  runelightVuePreviewRenderTargetMailbox = {
    announcePoolReady() {
      if (poolReadyAnnounced) return
      poolReadyAnnounced = true
      if (mailboxWindow.__runelightPreviewPrehydrationMailboxInstalled) return
      mailboxWindow.setTimeout(() => {
        mailboxWindow.parent.postMessage(createGPreviewPoolReadyMessage(), "*")
      }, 0)
    },
    getTarget() {
      return currentTarget
    },
    render,
    subscribe(subscriber) {
      subscribers.add(subscriber)
      if (currentTarget) subscriber(currentTarget)
      return () => {
        subscribers.delete(subscriber)
      }
    },
  }
  return runelightVuePreviewRenderTargetMailbox
}

function previewRouteParamsFromRenderTarget(
  target: GPreviewRenderTarget,
  renderRequestSequence: number,
): RunelightVuePreviewRouteParams {
  return {
    frameName: target.frameName,
    frameOverrides: new Map(target.frameOverrides ?? []),
    chrome: target.chrome,
    entry: target.entry,
    poolMode: false,
    renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  }
}

function showChromeForPreviewTarget(chrome: string | null): boolean {
  return chrome === null ? true : chrome !== "0"
}

function previewRenderTargetKey(target: RunelightVuePreviewRouteParams): string {
  return JSON.stringify({
    frameName: target.frameName,
    frameOverrides: [...target.frameOverrides],
    chrome: target.chrome,
    entry: target.entry,
    poolMode: target.poolMode,
    renderRequestSequence: target.renderRequestSequence,
    sessionId: target.sessionId,
    staticMode: target.staticMode,
  })
}

function readRunelightVuePreviewFrameOverrides(params: URLSearchParams): Map<string, string> {
  return readRunelightPreviewFrameOverridesFromSearchParams(params)
}

function useRunelightVuePreviewProtocolMessages(
  sessionId: string | null,
  enabled: Ref<boolean>,
  options: { staticMode?: boolean } = {},
) {
  let cleanup: (() => void) | undefined

  onMounted(() => {
    if (!sessionId || !enabled.value) return

    let scheduledFrame = 0
    let settleTimer = 0
    let settled = false
    let resizeObserver: ResizeObserver | undefined

    const settleStaticPreview = () => {
      settled = true
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("resize", scheduleLayoutPublish)
      resizeObserver?.disconnect()
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
      if (settleTimer) window.clearTimeout(settleTimer)
    }

    const publishLayout = async () => {
      await nextTick()
      const tree = readBoundaryTree()
      window.parent.postMessage(createGPreviewTreeMessage(sessionId, tree), "*")
      window.parent.postMessage(createGPreviewResizeMessage(sessionId, previewContentSize(tree)), "*")

      if (options.staticMode) {
        if (settleTimer) window.clearTimeout(settleTimer)
        settleTimer = window.setTimeout(settleStaticPreview, 400)
      }
    }

    const scheduleLayoutPublish = () => {
      if (settled || scheduledFrame) return
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0
        void publishLayout()
      })
    }

    const handleMessage = (event: MessageEvent) => {
      if (!isRuntimeValuesRequest(event.data, sessionId)) return

      const values = readBoundaryValues(event.data.boundaryId)
      if (values) {
        window.parent.postMessage(createGPreviewValuesMessage(sessionId, values), "*")
      }
    }

    window.addEventListener("message", handleMessage)
    window.addEventListener("resize", scheduleLayoutPublish)
    resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleLayoutPublish) : undefined
    resizeObserver?.observe(document.documentElement)
    if (document.body) resizeObserver?.observe(document.body)
    window.parent.postMessage(createGPreviewReadyMessage(sessionId), "*")
    void publishLayout()

    cleanup = () => {
      window.removeEventListener("message", handleMessage)
      window.removeEventListener("resize", scheduleLayoutPublish)
      resizeObserver?.disconnect()
      if (settleTimer) window.clearTimeout(settleTimer)
      if (scheduledFrame) window.cancelAnimationFrame(scheduledFrame)
    }
  })

  onBeforeUnmount(() => {
    cleanup?.()
  })
}

function readBoundaryTree(): GBoundaryTreeNode[] {
  return [...document.querySelectorAll<HTMLElement>("[data-runelight-boundary-id]")].map((element) => ({
    id: element.dataset.runelightBoundaryId ?? "",
    coordinate: element.dataset.runelightBoundaryCoordinate ?? "",
    rect: readElementRect(element),
    children: [],
  }))
}

function readBoundaryValues(boundaryId: string): GRuntimeValuesSnapshot | undefined {
  const element = document.querySelector<HTMLElement>(`[data-runelight-boundary-id="${CSS.escape(boundaryId)}"]`)
  if (!element) return undefined
  return {
    boundaryId,
    props: { type: "undefined" },
    providerValues: [],
  }
}

function readElementRect(element: HTMLElement): GBoundaryTreeNode["rect"] {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    const childRect = firstVisibleChildRect(element)
    if (childRect) return childRect
  }

  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  }
}

function firstVisibleChildRect(element: HTMLElement): GBoundaryTreeNode["rect"] | undefined {
  for (const child of element.children) {
    if (!(child instanceof HTMLElement)) continue
    const rect = child.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    }
  }

  return undefined
}

function previewContentSize(tree: GBoundaryTreeNode[]): { width: number; height: number } {
  const rects = tree.flatMap((node) => (node.rect ? [node.rect] : []))
  if (rects.length === 0) {
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }
  }

  const left = Math.min(0, ...rects.map((rect) => rect.x))
  const top = Math.min(0, ...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  }
}

function isRuntimeValuesRequest(
  message: unknown,
  sessionId: string,
): message is Extract<GPreviewSessionMessage, { type: "runelight:request-values" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "runelight:request-values" &&
    (message as { protocolVersion?: unknown }).protocolVersion === 1 &&
    (message as { sessionId?: unknown }).sessionId === sessionId &&
    typeof (message as { boundaryId?: unknown }).boundaryId === "string"
  )
}
