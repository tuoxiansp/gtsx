export type StudioRequestCoalescerContext = {
  hasPendingRequest: () => boolean
}

export type StudioRequestCoalescer<Request> = {
  clearPending: () => void
  hasPendingRequest: () => boolean
  request: (request: Request) => "cancelled" | "queued" | "started"
  whenIdle: () => Promise<void>
}

export type StudioRequestCoalescerOptions<Request> = {
  coalesce?: (pending: Request | undefined, next: Request) => Request
  isCancelled?: (request: Request) => boolean
  onIdle?: () => void
}

export function createStudioRequestCoalescer<Request>(
  run: (request: Request, context: StudioRequestCoalescerContext) => Promise<void> | void,
  options: StudioRequestCoalescerOptions<Request> = {},
): StudioRequestCoalescer<Request> {
  let inFlight = false
  let pending: Request | undefined
  let idleResolvers: Array<() => void> = []

  const isCancelled = (request: Request) => options.isCancelled?.(request) ?? false
  const hasPendingRequest = () => pending !== undefined && !isCancelled(pending)
  const context: StudioRequestCoalescerContext = { hasPendingRequest }

  const resolveIdle = () => {
    if (inFlight || hasPendingRequest()) return

    options.onIdle?.()
    const resolvers = idleResolvers
    idleResolvers = []
    for (const resolve of resolvers) resolve()
  }

  const start = (request: Request): "cancelled" | "started" => {
    if (isCancelled(request)) {
      resolveIdle()
      return "cancelled"
    }

    inFlight = true
    void Promise.resolve()
      .then(() => run(request, context))
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
        const next = pending
        pending = undefined

        if (next !== undefined && !isCancelled(next)) {
          start(next)
          return
        }

        resolveIdle()
      })

    return "started"
  }

  return {
    clearPending() {
      pending = undefined
      resolveIdle()
    },
    hasPendingRequest,
    request(next) {
      if (isCancelled(next)) return "cancelled"

      if (inFlight) {
        pending = options.coalesce ? options.coalesce(pending, next) : next
        return "queued"
      }

      return start(next)
    },
    whenIdle() {
      if (!inFlight && !hasPendingRequest()) return Promise.resolve()
      return new Promise((resolve) => {
        idleResolvers.push(resolve)
      })
    },
  }
}
