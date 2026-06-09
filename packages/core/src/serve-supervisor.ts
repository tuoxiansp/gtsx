import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:net"

import { expandCommand } from "./script-adapter.js"
import {
  acquireRunelightServeLock,
  createRunelightServeSessionId,
  readHealthyRunelightServeSession,
  readRunelightServeSession,
  removeRunelightServeSession,
  type RunelightServeLock,
  type RunelightServeSession,
  runelightServeSessionProjectKey,
  runelightServeSessionStudioUrl,
  RUNELIGHT_DEV_ENV,
  isRunelightServeBaseUrlHealthy,
  RUNELIGHT_PROJECT_KEY_ENV,
  RUNELIGHT_SESSION_ID_ENV,
  writeRunelightServeSession,
} from "./serve-session.js"

export type HostStdioMode = "inherit" | "pipe"

export type ServeSupervisorResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type HostServer = ServeSupervisorResult & {
  pid?: number
  stop(): void
  waitForExit(): Promise<number>
}

type HostStopStrategy = "auto" | "process-group" | "process-tree"

const DEFAULT_PREVIEW_READY_TIMEOUT_MS = 180_000
const DEFAULT_PREVIEW_READY_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_RUNELIGHT_SERVE_PORT = 4300
const DEFAULT_RUNELIGHT_SERVE_PORT_ATTEMPTS = 20
const HOST_SHUTDOWN_TERM_GRACE_MS = 2_000
const HOST_SHUTDOWN_KILL_GRACE_MS = 2_000

export async function runServeSupervisor(
  hostCommand: string,
  cwd: string,
  params: {
    hostStdio?: HostStdioMode
    port?: string
    signal?: AbortSignal
    stderr: string
    writeStderr?: (chunk: string) => void
    writeStdout?: (chunk: string) => void
  },
): Promise<ServeSupervisorResult> {
  const activeSession = await readActiveRunelightServeSession(cwd)
  if (activeSession) {
    if (isProcessAlive(activeSession.supervisorPid)) {
      return existingServeSessionResult(activeSession, params)
    }
  }

  const serveLock = acquireRunelightServeLock(cwd)
  if (!serveLock.acquired) return serveLockBusyResult(serveLock.lock)

  try {
    if (activeSession) {
      return await adoptRunelightServeSession(cwd, activeSession, params)
    }

    return await startNewRunelightServeSession(hostCommand, cwd, params)
  } finally {
    serveLock.release()
  }
}

async function startNewRunelightServeSession(
  hostCommand: string,
  cwd: string,
  params: {
    hostStdio?: HostStdioMode
    port?: string
    signal?: AbortSignal
    stderr: string
    writeStderr?: (chunk: string) => void
    writeStdout?: (chunk: string) => void
  },
): Promise<ServeSupervisorResult> {
  const explicitPort = params.port
  const hostStdio = params.hostStdio ?? "pipe"
  const attempts = explicitPort ? 1 : DEFAULT_RUNELIGHT_SERVE_PORT_ATTEMPTS
  const firstPort =
    explicitPort ??
    (hostStdio === "inherit" ? await findAvailablePort(DEFAULT_RUNELIGHT_SERVE_PORT, attempts) : String(DEFAULT_RUNELIGHT_SERVE_PORT))
  if (!firstPort) return portUnavailableResult(DEFAULT_RUNELIGHT_SERVE_PORT, attempts)

  let port = firstPort
  let lastResult: ServeSupervisorResult | undefined

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const baseUrl = `http://127.0.0.1:${port}`
    const studioUrl = runelightServeSessionStudioUrl(baseUrl)
    const host = await startHostServer(hostCommand, cwd, {
      hostStdio,
      port,
      projectKey,
      readyUrl: studioUrl,
      sessionId,
      writeStderr: hostStdio === "pipe" ? params.writeStderr : undefined,
      writeStdout: hostStdio === "pipe" ? params.writeStdout : undefined,
    })

    if (host.exitCode !== 0) {
      lastResult = host
      if (explicitPort || !isLikelyPortConflictResult(host)) return host
      port = String(Number(port) + 1)
      continue
    }
    if (!(await isRunelightServeBaseUrlHealthy(baseUrl, { projectKey, sessionId }))) {
      host.stop()
      lastResult = {
        exitCode: 1,
        stdout: host.stdout,
        stderr: `[adapter-configuration] preview-server-not-ready: Preview server did not expose a matching Runelight manifest at ${runelightServeSessionStudioUrl(baseUrl)}.\n`,
      }
      if (explicitPort) return lastResult
      port = String(Number(port) + 1)
      continue
    }

    writeRunelightServeSession(cwd, {
      baseUrl,
      hostPid: host.pid ?? process.pid,
      mode: "runelight-dev",
      port,
      sessionId,
      startedAt: new Date().toISOString(),
      supervisorPid: process.pid,
    })

    const stdout = serveSessionUrls({ baseUrl })
    params.writeStdout?.(stdout)

    try {
      const exit = await waitForHostServerExit(host, params.signal)
      return {
        exitCode: exit.aborted ? 130 : exit.exitCode,
        stdout: params.writeStdout ? "" : stdout,
        stderr: params.stderr,
      }
    } finally {
      removeRunelightServeSession(cwd, { sessionId })
    }
  }

  return (
    lastResult ?? {
      ...portUnavailableResult(DEFAULT_RUNELIGHT_SERVE_PORT, DEFAULT_RUNELIGHT_SERVE_PORT_ATTEMPTS),
    }
  )
}

async function adoptRunelightServeSession(
  cwd: string,
  session: RunelightServeSession,
  params: {
    signal?: AbortSignal
    stderr: string
    writeStdout?: (chunk: string) => void
  },
): Promise<ServeSupervisorResult> {
  writeRunelightServeSession(cwd, {
    baseUrl: session.baseUrl,
    hostPid: session.hostPid,
    mode: session.mode,
    port: session.port,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    supervisorPid: process.pid,
  })

  const stdout = serveSessionUrls(session)
  params.writeStdout?.(stdout)

  let stopPromise: Promise<void> | undefined
  try {
    const exit = await waitForHostServerExit(
      {
        stop() {
          stopPromise ??= stopHostProcess(session.hostPid, "auto")
        },
        waitForExit() {
          return waitForStoppedHostExit(waitForProcessExit(session.hostPid), () => stopPromise)
        },
      },
      params.signal,
    )
    return {
      exitCode: exit.aborted ? 130 : exit.exitCode,
      stdout: params.writeStdout ? "" : stdout,
      stderr: params.stderr,
    }
  } finally {
    removeRunelightServeSession(cwd, { sessionId: session.sessionId })
  }
}

function existingServeSessionResult(
  session: RunelightServeSession,
  params: { stderr: string; writeStdout?: (chunk: string) => void },
): ServeSupervisorResult {
  const stdout = `Runelight serve is already running: ${session.baseUrl}\nStudio: ${runelightServeSessionStudioUrl(session.baseUrl)}\n`
  params.writeStdout?.(stdout)
  return {
    exitCode: 0,
    stdout: params.writeStdout ? "" : stdout,
    stderr: params.stderr,
  }
}

function serveLockBusyResult(lock: RunelightServeLock): ServeSupervisorResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `[adapter-configuration] serve-supervisor-already-running: Another runelight serve supervisor for this project is already running (PID ${lock.supervisorPid}). Stop it or wait for it to finish before running runelight serve again.\n`,
  }
}

async function readActiveRunelightServeSession(cwd: string): Promise<RunelightServeSession | undefined> {
  const session = readRunelightServeSession(cwd)
  if (!session) return undefined

  if (session.projectKey !== runelightServeSessionProjectKey(cwd)) {
    removeRunelightServeSession(cwd, { sessionId: session.sessionId })
    return undefined
  }

  const healthy = await isRunelightServeBaseUrlHealthy(session.baseUrl, {
    projectKey: session.projectKey,
    sessionId: session.sessionId,
  })
  if (!healthy) {
    removeRunelightServeSession(cwd, { sessionId: session.sessionId })
    return undefined
  }

  return session
}

export async function acquireRunelightServeSession(
  cwd: string,
  hostCommand: string | undefined,
  params: { port?: string; stderr: string },
): Promise<ServeSupervisorResult & { baseUrl?: string; stop(): void }> {
  if (params.port) {
    const baseUrl = `http://127.0.0.1:${params.port}`
    if (await isRunelightServeBaseUrlHealthy(baseUrl, { projectKey: runelightServeSessionProjectKey(cwd) })) {
      return {
        baseUrl,
        exitCode: 0,
        stdout: "",
        stderr: params.stderr,
        stop() {},
      }
    }
  }

  if (!params.port) {
    const activeSession = await readHealthyRunelightServeSession(cwd)
    if (activeSession.healthy && activeSession.session) {
      return {
        baseUrl: activeSession.session.baseUrl,
        exitCode: 0,
        stdout: "",
        stderr: params.stderr,
        stop() {},
      }
    }
  }

  if (!hostCommand) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "[adapter-configuration] missing-host-command: Missing host.command in runelight.config.ts.\n",
      stop() {},
    }
  }

  const serveLock = acquireRunelightServeLock(cwd)
  if (!serveLock.acquired) {
    return {
      ...serveLockBusyResult(serveLock.lock),
      stop() {},
    }
  }

  const port = params.port ?? (await findAvailablePort(DEFAULT_RUNELIGHT_SERVE_PORT, DEFAULT_RUNELIGHT_SERVE_PORT_ATTEMPTS))
  if (!port) {
    serveLock.release()
    return {
      ...portUnavailableResult(DEFAULT_RUNELIGHT_SERVE_PORT, DEFAULT_RUNELIGHT_SERVE_PORT_ATTEMPTS),
      stop() {},
    }
  }
  const baseUrl = `http://127.0.0.1:${port}`
  const studioUrl = runelightServeSessionStudioUrl(baseUrl)
  const sessionId = createRunelightServeSessionId()
  const previewServer = await startHostServer(hostCommand, cwd, {
    hostStdio: "pipe",
    port,
    projectKey: runelightServeSessionProjectKey(cwd),
    readyUrl: studioUrl,
    sessionId,
  })
  if (previewServer.exitCode !== 0) {
    serveLock.release()
    return previewServer
  }
  if (!(await isRunelightServeBaseUrlHealthy(baseUrl, { projectKey: runelightServeSessionProjectKey(cwd), sessionId }))) {
    previewServer.stop()
    serveLock.release()
    return {
      exitCode: 1,
      stdout: previewServer.stdout,
      stderr: `[adapter-configuration] preview-server-not-ready: Preview server did not expose a matching Runelight manifest at ${studioUrl}.\n`,
      stop() {},
    }
  }

  return {
    baseUrl,
    exitCode: 0,
    stdout: `No active runelight serve session found.\nStarting temporary Runelight serve session on ${baseUrl}...\n`,
    stderr: previewServer.stderr,
    stop() {
      previewServer.stop()
      serveLock.release()
    },
  }
}

async function startHostServer(
  serveCommand: string | undefined,
  cwd: string,
  params: {
    hostStdio: HostStdioMode
    port: string
    readyUrl?: string
    projectKey?: string
    sessionId?: string
    writeStderr?: (chunk: string) => void
    writeStdout?: (chunk: string) => void
  },
): Promise<HostServer> {
  if (!serveCommand) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "[adapter-configuration] missing-host-command: Missing host.command in runelight.config.ts.\n",
      stop() {},
      waitForExit: async () => 1,
    }
  }

  const stdio: ["ignore", "inherit" | "pipe", "inherit" | "pipe"] =
    params.hostStdio === "inherit" ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"]
  const stopStrategy: HostStopStrategy = params.hostStdio === "inherit" ? "process-tree" : "process-group"
  const detached = stopStrategy === "process-group" && process.platform !== "win32"
  const child = spawn(expandCommand(serveCommand, { cwd, port: params.port }), {
    cwd,
    detached,
    shell: true,
    stdio,
    env: {
      ...process.env,
      [RUNELIGHT_DEV_ENV]: "1",
      ...(params.projectKey ? { [RUNELIGHT_PROJECT_KEY_ENV]: params.projectKey } : {}),
      ...(params.sessionId ? { [RUNELIGHT_SESSION_ID_ENV]: params.sessionId } : {}),
    },
  })
  let stdout = ""
  let stderr = ""
  let exitCode: number | undefined

  child.stdout?.on("data", (chunk) => {
    const text = String(chunk)
    stdout += text
    params.writeStdout?.(text)
  })
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk)
    stderr += text
    params.writeStderr?.(text)
  })

  let stopPromise: Promise<void> | undefined
  const stop = () => {
    if (child.pid === undefined) {
      child.kill()
      return
    }
    if (exitCode !== undefined) return
    stopPromise ??= stopHostProcess(child.pid, stopStrategy, () => child.kill())
  }
  const exitPromise = new Promise<number>((resolve) => {
    child.on("error", (error) => {
      stderr += `${error.message}\n`
      exitCode = 1
      resolve(exitCode)
    })
    child.on("exit", (code) => {
      exitCode = code ?? 0
      resolve(exitCode)
    })
  })

  if (params.readyUrl) {
    const ready = await waitForHostUrl(params.readyUrl, exitPromise)
    if (ready === "ready") {
      return {
        exitCode: 0,
        pid: child.pid,
        stdout,
        stderr,
        stop,
        waitForExit: () => waitForStoppedHostExit(exitPromise, () => stopPromise),
      }
    }

    stop()
    return {
      exitCode: exitCode && exitCode !== 0 ? exitCode : 1,
      stdout,
      stderr: hostServerNotReadyStderr({
        ready,
        readyUrl: params.readyUrl,
        stderr,
        stdout,
      }),
      stop() {},
      waitForExit: () => waitForStoppedHostExit(exitPromise, () => stopPromise),
    }
  }

  await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 500))])

  return {
    exitCode: exitCode && exitCode !== 0 ? exitCode : 0,
    pid: child.pid,
    stdout,
    stderr,
    stop,
    waitForExit: () => waitForStoppedHostExit(exitPromise, () => stopPromise),
  }
}

function waitForHostServerExit(
  hostServer: { stop(): void; waitForExit(): Promise<number> },
  signal: AbortSignal | undefined,
): Promise<{ aborted: boolean; exitCode: number }> {
  if (!signal) return hostServer.waitForExit().then((exitCode) => ({ aborted: false, exitCode }))
  if (signal.aborted) {
    hostServer.stop()
    return hostServer.waitForExit().then(() => ({ aborted: true, exitCode: 130 }))
  }

  return new Promise((resolve) => {
    let aborted = false
    let settled = false
    const settle = (result: { aborted: boolean; exitCode: number }) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      resolve(result)
    }
    const onAbort = () => {
      aborted = true
      hostServer.stop()
      void hostServer.waitForExit().then(() => settle({ aborted: true, exitCode: 130 }))
    }

    signal.addEventListener("abort", onAbort, { once: true })
    void hostServer.waitForExit().then((exitCode) =>
      settle(aborted ? { aborted: true, exitCode: 130 } : { aborted: false, exitCode }),
    )
  })
}

function waitForProcessExit(pid: number): Promise<number> {
  if (!isProcessAlive(pid)) return Promise.resolve(0)

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (isProcessAlive(pid)) return
      clearInterval(timer)
      resolve(0)
    }, 250)
  })
}

async function waitForStoppedHostExit(exitPromise: Promise<number>, stopPromise: () => Promise<void> | undefined): Promise<number> {
  const exitCode = await exitPromise
  await stopPromise()
  return exitCode
}

async function stopHostProcess(pid: number, strategy: HostStopStrategy, fallback?: () => void): Promise<void> {
  if (pid === process.pid) return
  if (process.platform === "win32") {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      fallback?.()
    }
    await waitForProcessExit(pid)
    return
  }

  if (strategy === "auto") {
    const processInfo = processInfoForPid(pid)
    await (processInfo?.pgid === pid ? stopProcessGroup(pid, fallback) : stopPidTree(pid, fallback))
    return
  }

  await (strategy === "process-group" ? stopProcessGroup(pid, fallback) : stopPidTree(pid, fallback))
}

async function stopProcessGroup(pgid: number, fallback?: () => void): Promise<void> {
  try {
    process.kill(-pgid, "SIGTERM")
  } catch {
    try {
      process.kill(pgid, "SIGTERM")
    } catch {
      fallback?.()
    }
  }

  if (await waitForProcessGroupExit(pgid, HOST_SHUTDOWN_TERM_GRACE_MS)) return

  try {
    process.kill(-pgid, "SIGKILL")
  } catch {
    try {
      process.kill(pgid, "SIGKILL")
    } catch {
      // Best effort; the process group may have exited between checks.
    }
  }
  await waitForProcessGroupExit(pgid, HOST_SHUTDOWN_KILL_GRACE_MS)
}

async function stopPidTree(rootPid: number, fallback?: () => void): Promise<void> {
  const termPids = processTreePids(rootPid)
  if (termPids.length === 0) {
    fallback?.()
    return
  }

  for (const pid of [...termPids].reverse()) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // The process may have exited between tree inspection and signaling.
    }
  }
  if (await waitForPidsExit(termPids, HOST_SHUTDOWN_TERM_GRACE_MS)) return

  const killPids = termPids.filter((pid) => isProcessAlive(pid))
  for (const pid of [...killPids].reverse()) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // Best effort; the process may already be gone.
    }
  }
  await waitForPidsExit(killPids, HOST_SHUTDOWN_KILL_GRACE_MS)
}

function processTreePids(rootPid: number): number[] {
  const result = spawnSync("ps", ["-axo", "pid=,ppid="], {
    encoding: "utf8",
  })
  if (result.status !== 0) return isProcessAlive(rootPid) ? [rootPid] : []

  const childrenByParent = new Map<number, number[]>()
  for (const line of result.stdout.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (!match) continue
    const pid = Number(match[1])
    const ppid = Number(match[2])
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) continue
    const children = childrenByParent.get(ppid) ?? []
    children.push(pid)
    childrenByParent.set(ppid, children)
  }

  const pids: number[] = []
  const queue = [rootPid]
  const seen = new Set<number>()
  for (const pid of queue) {
    if (pid === process.pid || seen.has(pid)) continue
    seen.add(pid)
    pids.push(pid)
    queue.push(...(childrenByParent.get(pid) ?? []))
  }
  return pids.filter((pid) => isProcessAlive(pid))
}

function waitForPidsExit(pids: number[], timeoutMs: number): Promise<boolean> {
  if (pids.every((pid) => !isProcessAlive(pid))) return Promise.resolve(true)

  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (pids.every((pid) => !isProcessAlive(pid))) {
        clearInterval(timer)
        resolve(true)
        return
      }
      if (Date.now() >= deadline) {
        clearInterval(timer)
        resolve(false)
      }
    }, 100)
  })
}

function waitForProcessGroupExit(pgid: number, timeoutMs: number): Promise<boolean> {
  if (!isProcessGroupAlive(pgid)) return Promise.resolve(true)

  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (!isProcessGroupAlive(pgid)) {
        clearInterval(timer)
        resolve(true)
        return
      }
      if (Date.now() >= deadline) {
        clearInterval(timer)
        resolve(false)
      }
    }, 100)
  })
}

function isProcessGroupAlive(pgid: number): boolean {
  if (process.platform === "win32") return isProcessAlive(pgid)
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

function hostServerNotReadyStderr(input: {
  ready: "exit" | "timeout"
  readyUrl: string
  stderr: string
  stdout: string
}): string {
  const stderr = input.stderr.endsWith("\n") || input.stderr.length === 0 ? input.stderr : `${input.stderr}\n`
  const hint = hostProcessHint(`${input.stdout}\n${input.stderr}`)
  return `${stderr}${hint}[adapter-configuration] preview-server-not-ready: Preview server did not make ${input.readyUrl} reachable before ${input.ready}.\n`
}

function hostProcessHint(output: string): string {
  const pid = hostOutputPid(output)
  const port = hostOutputPort(output)
  if (!pid && !port) return ""

  const lines = ["[adapter-configuration] host-process-hint:"]
  if (pid) {
    const processInfo = processInfoForPid(pid)
    lines.push(`Host output reported PID ${pid}. Upstream hints such as \`kill ${pid}\` may only target one process in a launch chain.`)
    if (processInfo && process.platform !== "win32") {
      lines.push(`That PID is currently in process group ${processInfo.pgid} with parent PID ${processInfo.ppid}.`)
      lines.push(`Inspect the full group: ps -o pid,ppid,pgid,stat,command -g ${processInfo.pgid}`)
      lines.push(`Stop the full group: kill -TERM -${processInfo.pgid}`)
      lines.push(`If it ignores TERM, use: kill -KILL -${processInfo.pgid}`)
    } else if (process.platform === "win32") {
      lines.push(`On Windows, inspect the process tree before retrying: tasklist /FI "PID eq ${pid}"`)
    } else {
      lines.push("That PID is not currently inspectable; it may have exited or the listener may be owned by a related process.")
    }
  }
  if (port && process.platform !== "win32") {
    lines.push(`Inspect the port owner: lsof -nP -iTCP:${port} -sTCP:LISTEN`)
  }

  return `${lines.join("\n")}\n`
}

function hostOutputPid(output: string): number | undefined {
  const match = output.match(/(?:^|\n)\s*PID:\s*(\d+)\b/i) ?? output.match(/\bkill\s+(\d+)\b/i)
  if (!match) return undefined
  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

function hostOutputPort(output: string): number | undefined {
  const localUrl = output.match(/(?:^|\n)\s*Local:\s*(https?:\/\/[^\s]+)/i)?.[1]
  if (localUrl) {
    try {
      const port = Number(new URL(localUrl).port)
      if (Number.isSafeInteger(port) && port > 0) return port
    } catch {
      // Fall through to generic port parsing.
    }
  }

  const portMatch = output.match(/\b(?:localhost|127\.0\.0\.1):(\d+)\b/i)
  if (!portMatch) return undefined
  const port = Number(portMatch[1])
  return Number.isSafeInteger(port) && port > 0 ? port : undefined
}

function processInfoForPid(pid: number): { pid: number; ppid: number; pgid: number } | undefined {
  if (process.platform === "win32") return undefined

  const result = spawnSync("ps", ["-o", "pid=,ppid=,pgid=,stat=,command=", "-p", String(pid)], {
    encoding: "utf8",
  })
  if (result.status !== 0) return undefined

  const match = result.stdout.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+.+$/)
  if (!match) return undefined

  const parsedPid = Number(match[1])
  const ppid = Number(match[2])
  const pgid = Number(match[3])
  if (![parsedPid, ppid, pgid].every((value) => Number.isSafeInteger(value) && value > 0)) return undefined
  return { pid: parsedPid, ppid, pgid }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isLikelyPortConflictResult(result: ServeSupervisorResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return output.includes("eaddrinuse") || output.includes("address already in use") || (output.includes("port") && output.includes("already in use"))
}

function portUnavailableResult(startPort: number, attempts: number): ServeSupervisorResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: `[adapter-configuration] port-unavailable: Unable to start Runelight serve between ports ${startPort} and ${startPort + attempts - 1}.\n`,
  }
}

function serveSessionUrls(session: Pick<RunelightServeSession, "baseUrl">): string {
  return `Runelight serve: ${session.baseUrl}\nStudio: ${runelightServeSessionStudioUrl(session.baseUrl)}\n`
}

function findAvailablePort(startPort: number, attempts: number): Promise<string | undefined> {
  return new Promise((resolvePort) => {
    let port = startPort
    let remainingAttempts = attempts
    const tryPort = () => {
      if (remainingAttempts <= 0) {
        resolvePort(undefined)
        return
      }
      remainingAttempts -= 1
      const server = createServer()
      server.once("error", () => {
        port += 1
        tryPort()
      })
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolvePort(String(port)))
      })
    }
    tryPort()
  })
}

async function waitForHostUrl(readyUrl: string, exitPromise: Promise<number>): Promise<"ready" | "exit" | "timeout"> {
  const deadline = Date.now() + DEFAULT_PREVIEW_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const result = await Promise.race([
      exitPromise.then(() => "exit" as const),
      fetch(readyUrl, { redirect: "manual", signal: AbortSignal.timeout(DEFAULT_PREVIEW_READY_REQUEST_TIMEOUT_MS) })
        .then((response) => (response.status >= 200 && response.status < 400 ? ("ready" as const) : ("retry" as const)))
        .catch(() => "retry" as const),
    ])
    if (result === "ready" || result === "exit") return result
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return "timeout"
}
