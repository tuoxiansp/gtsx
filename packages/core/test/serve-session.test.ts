import { mkdtempSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  acquireRunelightServeLock,
  createRunelightServeSessionId,
  readRunelightServeLock,
  readHealthyRunelightServeSession,
  readRunelightServeSession,
  removeRunelightServeSession,
  runelightServeSessionPreviewUrl,
  runelightServeSessionProjectKey,
  writeRunelightServeSession,
} from "../src/serve-session.js"

const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
let sessionDir: string
let projectRoot: string

describe("Runelight serve session registry", () => {
  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "runelight-session-registry-"))
    projectRoot = mkdtempSync(join(tmpdir(), "runelight-session-project-"))
    process.env.RUNELIGHT_SESSION_DIR = sessionDir
  })

  afterEach(() => {
    if (previousSessionDir === undefined) {
      delete process.env.RUNELIGHT_SESSION_DIR
    } else {
      process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
    }
    rmSync(sessionDir, { force: true, recursive: true })
    rmSync(projectRoot, { force: true, recursive: true })
  })

  it("accepts a registry entry only when the session identity matches", async () => {
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(projectRoot)
    const server = await startSessionServer({ projectKey, sessionId })

    try {
      writeRunelightServeSession(projectRoot, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      await expect(readHealthyRunelightServeSession(projectRoot)).resolves.toMatchObject({
        healthy: true,
        session: {
          baseUrl: server.baseUrl,
          projectKey,
          sessionId,
        },
      })
    } finally {
      await server.close()
    }
  })

  it("removes stale entries when the session identity does not match", async () => {
    const sessionId = createRunelightServeSessionId()
    const server = await startSessionServer({ projectKey: "other-project", sessionId })

    try {
      writeRunelightServeSession(projectRoot, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      await expect(readHealthyRunelightServeSession(projectRoot)).resolves.toEqual({ healthy: false })
      expect(readRunelightServeSession(projectRoot)).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it("accepts an active session even when recorded supervisor pid is stale", async () => {
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(projectRoot)
    const server = await startSessionServer({ projectKey, sessionId })

    try {
      writeRunelightServeSession(projectRoot, {
        baseUrl: server.baseUrl,
        hostPid: 999_999_998,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: 999_999_999,
      })

      await expect(readHealthyRunelightServeSession(projectRoot)).resolves.toMatchObject({
        healthy: true,
        session: {
          baseUrl: server.baseUrl,
          projectKey,
          sessionId,
        },
      })
    } finally {
      await server.close()
    }
  })

  it("removes only the session owned by the caller", () => {
    writeRunelightServeSession(projectRoot, {
      baseUrl: "http://127.0.0.1:4300",
      hostPid: process.pid,
      mode: "runelight-dev",
      port: "4300",
      sessionId: "foreground-session",
      startedAt: new Date().toISOString(),
      supervisorPid: process.pid,
    })

    removeRunelightServeSession(projectRoot, { sessionId: "temporary-session" })
    expect(readRunelightServeSession(projectRoot)?.sessionId).toBe("foreground-session")

    removeRunelightServeSession(projectRoot, { sessionId: "foreground-session" })
    expect(readRunelightServeSession(projectRoot)).toBeUndefined()
  })

  it("allows only one active serve lock for a project", () => {
    const firstLock = acquireRunelightServeLock(projectRoot)
    expect(firstLock.acquired).toBe(true)
    expect(readRunelightServeLock(projectRoot)?.supervisorPid).toBe(process.pid)

    const secondLock = acquireRunelightServeLock(projectRoot)
    expect(secondLock.acquired).toBe(false)
    expect(secondLock.lock.supervisorPid).toBe(process.pid)

    if (firstLock.acquired) firstLock.release()
    expect(readRunelightServeLock(projectRoot)).toBeUndefined()

    const thirdLock = acquireRunelightServeLock(projectRoot)
    expect(thirdLock.acquired).toBe(true)
    if (thirdLock.acquired) thirdLock.release()
  })

  it("escapes frame override parts when creating preview URLs", () => {
    expect(
      runelightServeSessionPreviewUrl("http://localhost:4321/", {
        entry: "src/App.g.tsx#default",
        frameName: "ready",
        frameOverrides: ["src/Child.g.tsx#default:open:error"],
      }),
    ).toBe(
      "http://localhost:4321/runelight?entry=src%2FApp.g.tsx%23default&frame=ready&chrome=0&frameOverride=src%252FChild.g.tsx%2523default%3Aopen%253Aerror",
    )
  })
})

async function startSessionServer(identity: { projectKey: string; sessionId: string }): Promise<{
  baseUrl: string
  close(): Promise<void>
  port: string
}> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ serveSession: identity }))
  })

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Unable to read test server address.")
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
    port: String(address.port),
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
