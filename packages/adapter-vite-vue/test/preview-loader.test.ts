import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runelightViteVue as createPublicRunelightViteVue } from "../src/index.js"
import { createRunelightViteVuePreviewComponentLoader } from "../src/preview.js"

type TestTransformResult = { code: string; map: null } | null
type TestRunelightViteVuePlugin = {
  config(): {
    define: Record<string, string>
  }
  configResolved(config: { root: string }): void
  configureServer(server: unknown): void
  load(id: string): Promise<TestTransformResult>
  resolveId(id: string): string | null
  transform(code: string, id: string): TestTransformResult
}

const runelightViteVue = createPublicRunelightViteVue as unknown as (
  options?: Parameters<typeof createPublicRunelightViteVue>[0],
) => TestRunelightViteVuePlugin

describe("Vite Vue preview loader", () => {
  const previousRunelightDev = process.env.RUNELIGHT_DEV

  beforeEach(() => {
    process.env.RUNELIGHT_DEV = "1"
  })

  afterEach(() => {
    if (previousRunelightDev === undefined) {
      delete process.env.RUNELIGHT_DEV
    } else {
      process.env.RUNELIGHT_DEV = previousRunelightDev
    }
  })

  it("maps Vite glob keys with preview queries back to Runelight Vue entry coordinates", async () => {
    const component = { frames: { ready: { props: {}, scope: { status: "ready" } } } }
    const loader = createRunelightViteVuePreviewComponentLoader(
      {
        "./UserCard.g.vue?runelight-preview": async () => ({ default: component }),
      },
      { sourceRoot: "src" },
    )

    await expect(loader("src/UserCard.g.vue#default")).resolves.toBe(component)
  })

  it("exposes Runelight dev mode to the Vite browser entry", () => {
    const plugin = runelightViteVue({ root: "/repo" })

    expect(plugin.config()).toMatchObject({
      define: {
        __RUNELIGHT_DEV__: "true",
      },
    })
  })

  it("keeps the Vite browser entry disabled outside runelight serve", () => {
    const previousRunelightDev = process.env.RUNELIGHT_DEV
    delete process.env.RUNELIGHT_DEV

    try {
      const plugin = runelightViteVue({ root: "/repo" })

      expect(plugin.config()).toMatchObject({
        define: {
          __RUNELIGHT_DEV__: "false",
        },
      })
    } finally {
      if (previousRunelightDev === undefined) {
        delete process.env.RUNELIGHT_DEV
      } else {
        process.env.RUNELIGHT_DEV = previousRunelightDev
      }
    }
  })

  it("transforms preview SFC modules through the adapter-owned runtime export", () => {
    const plugin = runelightViteVue({ root: "/repo" })
    const result = plugin.transform(
      [
        "<template>",
        "  <section>{{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default { ready: { scope: { status: 'ready' } } }",
        "</g:frames>",
      ].join("\n"),
      "/repo/src/UserCard.g.vue?runelight-preview",
    )

    expect(result?.code).toContain('import { useRunelightVueFrame } from "@runelight/adapter-vite-vue/preview"')
    expect(result?.code).not.toContain('import { useRunelightVueFrame } from "@runelight/vue/preview"')
  })

  it("elides frames from ordinary Vue imports", () => {
    const plugin = runelightViteVue({ root: "/repo" })
    const result = plugin.transform(
      [
        "<template>",
        "  <section>{{ status }}</section>",
        "</template>",
        "<script setup lang=\"ts\">",
        "const status = useRemoteStatus()",
        "</script>",
        "<g:frames>",
        "export default { ready: { scope: { status: 'ready' } } }",
        "</g:frames>",
      ].join("\n"),
      "/repo/src/UserCard.g.vue",
    )

    expect(result?.code).toContain("<template>")
    expect(result?.code).not.toContain("<g:frames>")
  })

  it("serves the Runelight session endpoint from the Vite dev server", async () => {
    const root = mkdtempSync(join(tmpdir(), "runelight-vite-vue-session-host-"))
    const previousProjectKey = process.env.RUNELIGHT_PROJECT_KEY
    const previousSessionId = process.env.RUNELIGHT_SESSION_ID

    try {
      process.env.RUNELIGHT_DEV = "1"
      process.env.RUNELIGHT_PROJECT_KEY = "project-key"
      process.env.RUNELIGHT_SESSION_ID = "session-id"
      const plugin = runelightViteVue({
        config: {
          contracts: ["@runelight/vue/contract"],
          project: {
            sourceRoot: "src",
            entryRoot: "src/app/runelight",
          },
        },
        root,
      })
      plugin.configResolved({ root })
      const server = createViteMiddlewareHarness()
      plugin.configureServer(server)

      const sessionResponse = await server.request("/runelight/session")
      expect(sessionResponse).toMatchObject({ statusCode: 200 })
      expect(sessionResponse.headers["cache-control"]).toBe("no-store")
      expect(JSON.parse(sessionResponse.body)).toEqual({
        serveSession: {
          projectKey: "project-key",
          sessionId: "session-id",
        },
      })
    } finally {
      rmSync(root, { force: true, recursive: true })
      if (previousProjectKey === undefined) delete process.env.RUNELIGHT_PROJECT_KEY
      else process.env.RUNELIGHT_PROJECT_KEY = previousProjectKey
      if (previousSessionId === undefined) delete process.env.RUNELIGHT_SESSION_ID
      else process.env.RUNELIGHT_SESSION_ID = previousSessionId
    }
  })
})

type ViteMiddlewareResponse = {
  body: string
  headers: Record<string, string>
  statusCode: number
}

function createViteMiddlewareHarness() {
  type Middleware = (request: { method?: string; url?: string }, response: unknown, next: () => void) => void
  const middlewares: Middleware[] = []

  return {
    middlewares: {
      use(handler: Middleware) {
        middlewares.push(handler)
      },
    },
    watcher: {
      add() {},
    },
    async request(url: string): Promise<ViteMiddlewareResponse> {
      let index = 0
      const response: ViteMiddlewareResponse = {
        body: "",
        headers: {},
        statusCode: 404,
      }
      await new Promise<void>((resolveRequest) => {
        const writableResponse = {
          get statusCode() {
            return response.statusCode
          },
          set statusCode(nextStatusCode: number) {
            response.statusCode = nextStatusCode
          },
          setHeader(name: string, value: string) {
            response.headers[name.toLowerCase()] = value
          },
          end(body = "") {
            response.body += String(body)
            resolveRequest()
          },
        }
        const next = () => {
          const middleware = middlewares[index++]
          if (!middleware) {
            resolveRequest()
            return
          }

          middleware({ method: "GET", url }, writableResponse, next)
        }
        next()
      })

      return response
    },
  }
}
