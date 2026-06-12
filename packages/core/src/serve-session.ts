import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { normalizeRunelightPreviewFrameOverride } from "./preview-protocol.js"

export const RUNELIGHT_DEV_ENV = "RUNELIGHT_DEV"
export const RUNELIGHT_PROJECT_KEY_ENV = "RUNELIGHT_PROJECT_KEY"
export const RUNELIGHT_SESSION_ID_ENV = "RUNELIGHT_SESSION_ID"

export type RunelightServeSession = {
  schema: 1
  baseUrl: string
  cwd: string
  hostPid: number
  mode: "runelight-dev"
  port: string
  projectKey: string
  sessionId: string
  startedAt: string
  supervisorPid: number
}

export type RunelightServeLock = {
  schema: 1
  cwd: string
  projectKey: string
  startedAt: string
  supervisorPid: number
}

export type RunelightServeLockHandle =
  | {
      acquired: true
      lock: RunelightServeLock
      release(): void
    }
  | {
      acquired: false
      lock: RunelightServeLock
    }

export type RunelightServeSessionHealth = {
  healthy: boolean
  session?: RunelightServeSession
}

export type RunelightServeManifestIdentity = {
  projectKey?: string
  sessionId?: string
}

export function readRunelightServeSession(cwd: string): RunelightServeSession | undefined {
  const filePath = runelightServeSessionFilePath(cwd)
  if (!existsSync(filePath)) return undefined

  try {
    const session = JSON.parse(readFileSync(filePath, "utf8")) as RunelightServeSession
    if (session.schema !== 1) {
      removeRunelightServeSession(cwd)
      return undefined
    }
    return session
  } catch {
    removeRunelightServeSession(cwd)
    return undefined
  }
}

export function writeRunelightServeSession(cwd: string, session: Omit<RunelightServeSession, "cwd" | "projectKey" | "schema">): RunelightServeSession {
  const fullSession: RunelightServeSession = {
    ...session,
    cwd: realpathSync(cwd),
    projectKey: runelightServeSessionProjectKey(cwd),
    schema: 1,
  }
  const filePath = runelightServeSessionFilePath(cwd)
  mkdirSync(runelightServeSessionDirectory(), { recursive: true })
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tempFilePath, `${JSON.stringify(fullSession, null, 2)}\n`)
  renameSync(tempFilePath, filePath)
  return fullSession
}

export function removeRunelightServeSession(cwd: string, options: { sessionId?: string } = {}): void {
  if (options.sessionId) {
    const session = readRunelightServeSession(cwd)
    if (session && session.sessionId !== options.sessionId) return
  }

  rmSync(runelightServeSessionFilePath(cwd), { force: true })
}

export function acquireRunelightServeLock(cwd: string): RunelightServeLockHandle {
  const lock = createRunelightServeLock(cwd)
  const lockPath = runelightServeLockPath(cwd)
  mkdirSync(runelightServeSessionDirectory(), { recursive: true })

  try {
    mkdirSync(lockPath)
    writeFileSync(runelightServeLockOwnerFilePath(cwd), `${JSON.stringify(lock, null, 2)}\n`)
    return {
      acquired: true,
      lock,
      release() {
        releaseRunelightServeLock(cwd, { supervisorPid: lock.supervisorPid })
      },
    }
  } catch {
    const existingLock = readRunelightServeLock(cwd)
    if (!existingLock || !isProcessAlive(existingLock.supervisorPid)) {
      releaseRunelightServeLock(cwd)
      return acquireRunelightServeLock(cwd)
    }

    return {
      acquired: false,
      lock: existingLock,
    }
  }
}

export function readRunelightServeLock(cwd: string): RunelightServeLock | undefined {
  const filePath = runelightServeLockOwnerFilePath(cwd)
  if (!existsSync(filePath)) return undefined

  try {
    const lock = JSON.parse(readFileSync(filePath, "utf8")) as RunelightServeLock
    if (lock.schema !== 1 || lock.projectKey !== runelightServeSessionProjectKey(cwd)) {
      releaseRunelightServeLock(cwd)
      return undefined
    }
    return lock
  } catch {
    releaseRunelightServeLock(cwd)
    return undefined
  }
}

export function releaseRunelightServeLock(cwd: string, options: { supervisorPid?: number } = {}): void {
  if (options.supervisorPid) {
    const lock = readRunelightServeLock(cwd)
    if (lock && lock.supervisorPid !== options.supervisorPid) return
  }

  rmSync(runelightServeLockPath(cwd), { recursive: true, force: true })
}

export async function readHealthyRunelightServeSession(cwd: string): Promise<RunelightServeSessionHealth> {
  const session = readRunelightServeSession(cwd)
  if (!session) return { healthy: false }

  if (session.projectKey !== runelightServeSessionProjectKey(cwd)) {
    removeRunelightServeSession(cwd, { sessionId: session.sessionId })
    return { healthy: false }
  }

  const healthy = await isRunelightServeBaseUrlHealthy(session.baseUrl, {
    projectKey: session.projectKey,
    sessionId: session.sessionId,
  })
  if (!healthy) {
    removeRunelightServeSession(cwd, { sessionId: session.sessionId })
    return { healthy: false }
  }

  return { healthy: true, session }
}

export function runelightServeSessionStudioUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/runelight/studio`
}

export function runelightServeSessionManifestUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/runelight/studio/manifest`
}

export async function isRunelightServeBaseUrlHealthy(
  baseUrl: string,
  expectedIdentity: RunelightServeManifestIdentity = {},
): Promise<boolean> {
  const manifest = await readRunelightServeManifestIdentity(baseUrl)
  if (!manifest) return false
  if (!expectedIdentity.projectKey && !expectedIdentity.sessionId) return true

  if (expectedIdentity.projectKey && manifest.projectKey !== expectedIdentity.projectKey) return false
  if (expectedIdentity.sessionId && manifest.sessionId !== expectedIdentity.sessionId) return false
  return true
}

export async function readRunelightServeManifestIdentity(baseUrl: string): Promise<RunelightServeManifestIdentity | undefined> {
  try {
    const response = await fetch(runelightServeSessionManifestUrl(baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(2_000),
    })
    if (response.status < 200 || response.status >= 400) return undefined
    const manifest = (await response.json()) as { serveSession?: RunelightServeManifestIdentity }
    return manifest.serveSession
  } catch {
    return undefined
  }
}

export function runelightServeSessionPreviewUrl(
  baseUrl: string,
  params: { entry: string; frameName?: string; frameOverrides?: string[]; all?: boolean },
): string {
  const searchParams = new URLSearchParams({ entry: params.entry })
  if (!params.all && params.frameName) searchParams.set("frame", params.frameName)
  if (!params.all) searchParams.set("chrome", "0")
  for (const frameOverride of params.frameOverrides ?? []) {
    searchParams.append("frameOverride", normalizeRunelightPreviewFrameOverride(frameOverride))
  }
  return `${baseUrl.replace(/\/+$/, "")}/runelight?${searchParams.toString()}`
}

function runelightServeSessionDirectory(): string {
  return process.env.RUNELIGHT_SESSION_DIR ?? join(homedir(), ".runelight", "sessions")
}

function runelightServeSessionFilePath(cwd: string): string {
  return join(runelightServeSessionDirectory(), `${runelightServeSessionProjectKey(cwd)}.json`)
}

function runelightServeLockPath(cwd: string): string {
  return join(runelightServeSessionDirectory(), `${runelightServeSessionProjectKey(cwd)}.lock`)
}

function runelightServeLockOwnerFilePath(cwd: string): string {
  return join(runelightServeLockPath(cwd), "owner.json")
}

export function createRunelightServeSessionId(): string {
  return randomUUID()
}

export function runelightServeSessionProjectKey(cwd: string): string {
  return createHash("sha256").update(realpathSync(cwd)).digest("hex").slice(0, 32)
}

function createRunelightServeLock(cwd: string): RunelightServeLock {
  return {
    cwd: realpathSync(cwd),
    projectKey: runelightServeSessionProjectKey(cwd),
    schema: 1,
    startedAt: new Date().toISOString(),
    supervisorPid: process.pid,
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
