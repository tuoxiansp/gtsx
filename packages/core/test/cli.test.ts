import { spawn, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createServer as createHttpServer, type Server as HttpServer } from "node:http"
import { createServer as createTcpServer } from "node:net"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

import { expandUrl, runCLI } from "../src/cli.js"
import {
  acquireRunelightServeLock,
  createRunelightServeSessionId,
  readRunelightServeLock,
  readRunelightServeSession,
  runelightServeSessionProjectKey,
  writeRunelightServeSession,
} from "../src/serve-session.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")

describe("runelight CLI", () => {
  it("prints help when invoked through a package manager bin symlink", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "runelight-cli-"))
    const linkedEntrypoint = join(tempDirectory, "node_modules/runelight/src/cli.ts")

    mkdirSync(join(tempDirectory, "node_modules/runelight/src"), { recursive: true })
    symlinkSync(join(import.meta.dirname, "../src/cli.ts"), linkedEntrypoint)
    const result = spawnSync("pnpm", ["exec", "tsx", linkedEntrypoint, "--help"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    })

    expect(result, `${result.stdout}\n${result.stderr}`).toMatchObject({ status: 0 })
    expect(result.stdout).toContain("runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir]")
  })

  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain("runelight check [-p <tsconfig-or-dir>] [entry[#export]|dir]")
    expect(result.stdout).toContain("runelight changes [-p <tsconfig-or-dir>] [--json]")
    expect(result.stdout).toContain("runelight serve [-p <tsconfig-or-dir>] [--port <port>]")
    expect(result.stdout).toContain("--frame-override <entry#export:frame>")
    expect(result.stdout).toContain("runelight capture [-p <tsconfig-or-dir>] <entry[#export]|dir>")
    expect(result.stdout).not.toContain("runelight init")
    expect(result.stdout).not.toContain("runelight strip")
  })

  it("lists current workspace UI changes as JSON", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-cli-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", target: "ES2022" }, include: ["src"] }),
      )
      writeFileSync(
        join(cwd, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: [${JSON.stringify(join(repositoryRoot, "packages/react/src/contract.ts"))}],
  project: {
    sourceRoot: "src",
    entryRoot: "src",
    tsconfig: "tsconfig.json",
  },
})
`,
      )
      writeFileSync(
        join(cwd, "src/Button.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type ButtonProps = { label: string }

export default function Button(props: ButtonProps) {
  return <button>{props.label}</button>
}

Button.frames = {
  ready: { props: { label: "Save" } },
} satisfies GFrames<ButtonProps>
`,
      )
      writeFileSync(
        join(cwd, "src/Link.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type LinkProps = { label: string }

export default function Link(props: LinkProps) {
  return <a>{props.label}</a>
}

Link.frames = {
  ready: { props: { label: "Docs" } },
} satisfies GFrames<LinkProps>
`,
      )
      spawnSync("git", ["init"], { cwd, encoding: "utf8" })
      spawnSync("git", ["add", "."], { cwd, encoding: "utf8" })
      spawnSync("git", ["-c", "user.email=runelight@example.test", "-c", "user.name=Runelight Test", "commit", "-m", "baseline"], {
        cwd,
        encoding: "utf8",
      })
      writeFileSync(
        join(cwd, "src/Button.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type ButtonProps = { label: string }

export default function Button(props: ButtonProps) {
  return <button><strong>{props.label}</strong></button>
}

Button.frames = {
  ready: { props: { label: "Save" } },
} satisfies GFrames<ButtonProps>
`,
      )
      writeFileSync(
        join(cwd, "src/Link.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type LinkProps = { label: string }

export default function Link(props: LinkProps) {
  return <a><span>{props.label}</span></a>
}

Link.frames = {
  ready: { props: { label: "Docs" } },
} satisfies GFrames<LinkProps>
`,
      )

      const result = await runCLI(["changes", "--json"], { cwd, stdout: "", stderr: "" })
      const report = JSON.parse(result.stdout)

      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(report.schemaVersion).toBe(1)
      expect(report.summary.files.modified).toBe(2)
      expect(report.components).toMatchObject([
        {
          codeStatus: "modified",
          coordinate: "src/Button.g.tsx#default",
          file: "src/Button.g.tsx",
          uiStatus: "changed",
          frames: [{ name: "ready", status: "changed" }],
        },
        {
          codeStatus: "modified",
          coordinate: "src/Link.g.tsx#default",
          file: "src/Link.g.tsx",
          uiStatus: "changed",
          frames: [{ name: "ready", status: "changed" }],
        },
      ])

      const filteredResult = await runCLI(["changes", "--json", "--component", "src/Button.g.tsx#default"], {
        cwd,
        stdout: "",
        stderr: "",
      })
      const filteredReport = JSON.parse(filteredResult.stdout)

      expect(filteredResult.exitCode, `${filteredResult.stdout}\n${filteredResult.stderr}`).toBe(0)
      expect(filteredReport.summary.files).toEqual({ added: 0, deleted: 0, modified: 1 })
      expect(filteredReport.summary.ui.changed).toBe(1)
      expect(filteredReport.components).toMatchObject([
        {
          coordinate: "src/Button.g.tsx#default",
          file: "src/Button.g.tsx",
        },
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("reports rendered frame prop changes as UI changes", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-cli-frame-prop-changes-"))

    try {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(
        join(cwd, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", target: "ES2022" }, include: ["src"] }),
      )
      writeFileSync(
        join(cwd, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: [${JSON.stringify(join(repositoryRoot, "packages/react/src/contract.ts"))}],
  project: {
    sourceRoot: "src",
    entryRoot: "src",
    tsconfig: "tsconfig.json",
  },
})
`,
      )
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type CardProps = { detail: string; tone: "ready" | "warning" }

export default function Card(props: CardProps) {
  return <section data-tone={props.tone}>{props.detail}</section>
}

Card.frames = {
  ready: { props: { detail: "Ready", tone: "ready" } },
  warning: { props: { detail: "Before", tone: "warning" } },
} satisfies GFrames<CardProps>
`,
      )
      spawnSync("git", ["init"], { cwd, encoding: "utf8" })
      spawnSync("git", ["add", "."], { cwd, encoding: "utf8" })
      spawnSync("git", ["-c", "user.email=runelight@example.test", "-c", "user.name=Runelight Test", "commit", "-m", "baseline"], {
        cwd,
        encoding: "utf8",
      })
      writeFileSync(
        join(cwd, "src/Card.g.tsx"),
        `import type { GFrames } from "@runelight/react"

type CardProps = { detail: string; tone: "ready" | "warning" }

export default function Card(props: CardProps) {
  return <section data-tone={props.tone}>{props.detail}</section>
}

Card.frames = {
  ready: { props: { detail: "Ready", tone: "ready" } },
  warning: { props: { detail: "After", tone: "warning" } },
} satisfies GFrames<CardProps>
`,
      )

      const result = await runCLI(["changes", "--json", "--ui-only"], { cwd, stdout: "", stderr: "" })
      const report = JSON.parse(result.stdout)

      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(report.summary.ui.changed).toBe(1)
      expect(report.components).toMatchObject([
        {
          coordinate: "src/Card.g.tsx#default",
          uiStatus: "changed",
          frames: [
            { name: "ready", status: "unchanged" },
            { name: "warning", status: "changed" },
          ],
        },
      ])
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("rejects unknown command options before loading project config", async () => {
    const result = await runCLI(["check", "src", "--wat"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("unknown-option")
    expect(result.stdout).toContain("--wat")
    expect(result.stdout).not.toContain("missing-config")
  })

  it("reports unknown commands as diagnostics on stderr", async () => {
    const result = await runCLI(["dance"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("[adapter-configuration] unknown-command:")
    expect(result.stderr).toContain("dance")
  })

  it("checks the configured project by default and reports missing config when none exists", async () => {
    const result = await runCLI(["check"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("[adapter-configuration] missing-config:")
    expect(result.stderr).toBe("")
  })

  it("reports missing capture entries as diagnostics on stderr", async () => {
    const result = await runCLI(["capture"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("[adapter-configuration] missing-capture-entry:")
    expect(result.stderr).not.toContain("missing-config")
  })

  it("rejects unexpected positional arguments before loading project config", async () => {
    const result = await runCLI(["serve", "extra"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("unexpected-argument")
    expect(result.stdout).toContain("extra")
    expect(result.stdout).not.toContain("missing-config")
  })

  it("serves the project Studio URL without requiring a component entry", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    rmSync(logFile, { force: true })

    const result = await runCLI(["serve", "--port", "4555"], { cwd, stdout: "", stderr: "" })

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Runelight serve: http://127.0.0.1:4555\nStudio: http://127.0.0.1:4555/runelight/studio\n",
      stderr: "",
    })
    expect(readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { action: "serve", args: ["--port", "4555"], runelightDev: "1" },
      { action: "ready-check", path: "/runelight/studio" },
      { action: "ready-check", path: "/runelight/studio/manifest" },
    ])
  })

  it("rejects invalid serve ports before loading project config", async () => {
    const result = await runCLI(["serve", "--port", "wide"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("invalid-port")
    expect(result.stdout).toContain("1 to 65535")
    expect(result.stdout).not.toContain("missing-config")
  })

  it("reports missing Host command for project-level serve", async () => {
    const result = await runCLI(["serve"], {
      cwd: join(import.meta.dirname, "fixtures/missing-studio-url"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-host-command")
    expect(result.stdout).toContain("Add host.command")
  })

  it("reports Host commands that do not accept a Runelight-owned port", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-invalid-host-command-"))
    try {
      writeFileSync(
        join(cwd, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
  host: {
    command: "pnpm dev",
  },
})
`,
      )

      const result = await runCLI(["serve"], { cwd, stdout: "", stderr: "" })

      expect(result.exitCode).toBe(1)
      expect(result.stdout).toContain("invalid-host-command")
      expect(result.stdout).toContain("{port}")
    } finally {
      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("retries the next Runelight-owned port when the Host reports a port conflict", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-retries-port")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const previousConflictPorts = process.env.RUNELIGHT_TEST_CONFLICT_PORTS
    const conflictPorts = Array.from({ length: 19 }, (_value, index) => String(4300 + index))
    rmSync(logFile, { force: true })

    process.env.RUNELIGHT_SESSION_DIR = sessionDir
    process.env.RUNELIGHT_TEST_CONFLICT_PORTS = conflictPorts.join(",")

    try {
      const result = await runCLI(["serve"], { cwd, stdout: "", stderr: "" })
      const logs = readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      const finalPort = [...logs].reverse().find((log) => log.action === "ready-check" && log.path === "/runelight/studio/manifest")?.port
      const serveAttempts = logs.filter((log) => log.action === "serve").map((log) => log.port)

      expect(result.exitCode).toBe(0)
      expect(serveAttempts.length).toBeGreaterThan(1)
      expect(serveAttempts.slice(0, -1).every((port) => conflictPorts.includes(port))).toBe(true)
      expect(finalPort).toBe(serveAttempts.at(-1))
      expect(conflictPorts).not.toContain(finalPort)
      expect(result.stdout).toContain(`Runelight serve: http://127.0.0.1:${finalPort}`)
      expect(logs).toContainEqual({ action: "ready-check", path: "/runelight/studio", port: finalPort })
      expect(logs).toContainEqual({ action: "ready-check", path: "/runelight/studio/manifest", port: finalPort })
    } finally {
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      if (previousConflictPorts === undefined) {
        delete process.env.RUNELIGHT_TEST_CONFLICT_PORTS
      } else {
        process.env.RUNELIGHT_TEST_CONFLICT_PORTS = previousConflictPorts
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("reports when the preview server exits before the Studio route is reachable", async () => {
    const result = await runCLI(["serve", "--port", "4556"], {
      cwd: join(import.meta.dirname, "fixtures/serve-exits-before-ready"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("preview-server-not-ready")
    expect(result.stderr).toContain("http://127.0.0.1:4556/runelight/studio")
  })

  it("adds a process-group hint when the Host reports a conflicting dev server PID", async () => {
    const result = await runCLI(["serve", "--port", "4557"], {
      cwd: join(import.meta.dirname, "fixtures/serve-next-conflict"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Another next dev server is already running")
    expect(result.stderr).toContain("host-process-hint")
    expect(result.stderr).toContain("Host output reported PID 987654321")
    expect(result.stderr).toContain("lsof -nP -iTCP:4300 -sTCP:LISTEN")
    expect(result.stderr).toContain("preview-server-not-ready")
  })

  it("adds the same process hint when foreground Host output is streamed to the terminal", async () => {
    const streamedStderr: string[] = []
    const result = await runCLI(["serve", "--port", "4558"], {
      cwd: join(import.meta.dirname, "fixtures/serve-next-conflict"),
      hostStdio: "inherit",
      stdout: "",
      stderr: "",
      writeStderr: (chunk) => streamedStderr.push(chunk),
    })
    const combinedStderr = `${streamedStderr.join("")}${result.stderr}`

    expect(result.exitCode).toBe(1)
    expect(combinedStderr).toContain("Another next dev server is already running")
    expect(combinedStderr).toContain("host-process-hint")
    expect(combinedStderr).toContain("Host output reported PID 987654321")
    expect(combinedStderr).toContain("lsof -nP -iTCP:4300 -sTCP:LISTEN")
    expect(combinedStderr).toContain("preview-server-not-ready")
  })

  it("preserves foreground Host ANSI color output while capturing output for diagnostics", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "runelight-host-color-output-"))
    const previousNoColor = process.env.NO_COLOR
    const previousForceColor = process.env.FORCE_COLOR
    const previousStdoutIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")
    const previousStderrIsTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY")

    try {
      delete process.env.NO_COLOR
      delete process.env.FORCE_COLOR
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
      Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true })

      mkdirSync(join(cwd, "scripts"), { recursive: true })
      writeFileSync(
        join(cwd, "runelight.config.ts"),
        `import { defineRunelightConfig } from "@runelight/core"

export default defineRunelightConfig({
  contracts: ["@runelight/react/contract"],
  project: {
    sourceRoot: "src",
    entryRoot: "app/runelight",
  },
  host: {
    command: "node scripts/color-output.mjs {port}",
  },
})
`,
      )
      writeFileSync(
        join(cwd, "scripts/color-output.mjs"),
        `const message = process.env.FORCE_COLOR ? "\\x1b[31mcolored host output\\x1b[39m" : "plain host output"
process.stderr.write(message + "\\n")
process.exit(1)
`,
      )

      const streamedStderr: string[] = []
      const result = await runCLI(["serve", "--port", "4559"], {
        cwd,
        hostStdio: "inherit",
        stdout: "",
        stderr: "",
        writeStderr: (chunk) => streamedStderr.push(chunk),
      })
      const combinedStderr = `${streamedStderr.join("")}${result.stderr}`

      expect(result.exitCode).toBe(1)
      expect(streamedStderr.join("")).toContain("\u001b[31mcolored host output\u001b[39m")
      expect(streamedStderr.join("")).not.toContain("plain host output")
      expect(result.stderr).not.toContain("colored host output")
      expect(combinedStderr).toContain("preview-server-not-ready")
    } finally {
      if (previousNoColor === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = previousNoColor
      if (previousForceColor === undefined) delete process.env.FORCE_COLOR
      else process.env.FORCE_COLOR = previousForceColor

      if (previousStdoutIsTTY) Object.defineProperty(process.stdout, "isTTY", previousStdoutIsTTY)
      else Reflect.deleteProperty(process.stdout, "isTTY")
      if (previousStderrIsTTY) Object.defineProperty(process.stderr, "isTTY", previousStderrIsTTY)
      else Reflect.deleteProperty(process.stderr, "isTTY")

      rmSync(cwd, { force: true, recursive: true })
    }
  })

  it("stops the foreground Host and removes the serve registry on SIGINT", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-until-signal")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const port = await getFreePort()
    const childStdout: string[] = []
    const childStderr: string[] = []
    let child: ReturnType<typeof spawn> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      child = spawn(join(repositoryRoot, "node_modules/.bin/tsx"), [join(repositoryRoot, "packages/core/src/cli.ts"), "serve", "--port", port], {
        cwd,
        env: { ...process.env, RUNELIGHT_SESSION_DIR: sessionDir },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout?.on("data", (chunk) => childStdout.push(String(chunk)))
      child.stderr?.on("data", (chunk) => childStderr.push(String(chunk)))

      await waitForCondition(
        async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(500),
            })
            return response.status >= 200 && response.status < 400
          } catch {
            return false
          }
        },
        10_000,
        () => `Timed out waiting for Studio manifest.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )
      await waitForCondition(
        () => readRunelightServeSession(cwd)?.port === port,
        5_000,
        () => `Timed out waiting for serve registry.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )

      const exitPromise = waitForChildExit(child, 10_000)
      child.kill("SIGINT")
      const exit = await exitPromise
      expect(exit.code).toBe(130)

      await waitForCondition(
        async () => {
          try {
            await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(250),
            })
            return false
          } catch {
            return true
          }
        },
        5_000,
        () => `Host was still reachable after SIGINT.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )

      expect(readRunelightServeSession(cwd)).toBeUndefined()
      expect(readRunelightServeLock(cwd)).toBeUndefined()
      const logs = readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(logs[0]).toMatchObject({ action: "serve", port, runelightDev: "1" })
      expect(logs).toContainEqual({ action: "shutdown", signal: "SIGTERM" })
    } finally {
      if (child && child.exitCode === null) child.kill("SIGTERM")
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("keeps the foreground Host in the terminal process group", async () => {
    if (process.platform === "win32") return

    const cwd = join(import.meta.dirname, "fixtures/serve-until-signal")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const port = await getFreePort()
    const childStdout: string[] = []
    const childStderr: string[] = []
    let child: ReturnType<typeof spawn> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      child = spawn(join(repositoryRoot, "node_modules/.bin/tsx"), [join(repositoryRoot, "packages/core/src/cli.ts"), "serve", "--port", port], {
        cwd,
        detached: true,
        env: { ...process.env, RUNELIGHT_SESSION_DIR: sessionDir },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout?.on("data", (chunk) => childStdout.push(String(chunk)))
      child.stderr?.on("data", (chunk) => childStderr.push(String(chunk)))

      await waitForCondition(
        async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(500),
            })
            return response.status >= 200 && response.status < 400
          } catch {
            return false
          }
        },
        10_000,
        () => `Timed out waiting for terminal-group Studio manifest.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )

      const exitPromise = waitForChildExit(child, 10_000)
      if (child.pid === undefined) throw new Error("Unable to signal CLI process group without a child pid")
      process.kill(-child.pid, "SIGINT")
      await exitPromise

      await waitForCondition(
        async () => {
          try {
            await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(250),
            })
            return false
          } catch {
            return true
          }
        },
        5_000,
        () => `Foreground Host survived terminal SIGINT.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )
    } finally {
      if (child?.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {
          // Best-effort test cleanup.
        }
      }
      stopPortListeners(port)
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("kills stubborn Host children after SIGINT", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-stubborn-child")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const port = await getFreePort()
    const childStdout: string[] = []
    const childStderr: string[] = []
    let child: ReturnType<typeof spawn> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      child = spawn(join(repositoryRoot, "node_modules/.bin/tsx"), [join(repositoryRoot, "packages/core/src/cli.ts"), "serve", "--port", port], {
        cwd,
        env: { ...process.env, RUNELIGHT_SESSION_DIR: sessionDir },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout?.on("data", (chunk) => childStdout.push(String(chunk)))
      child.stderr?.on("data", (chunk) => childStderr.push(String(chunk)))

      await waitForCondition(
        async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(500),
            })
            return response.status >= 200 && response.status < 400
          } catch {
            return false
          }
        },
        10_000,
        () => `Timed out waiting for stubborn child manifest.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )

      const exitPromise = waitForChildExit(child, 15_000)
      child.kill("SIGINT")
      const exit = await exitPromise
      expect(exit.code).toBe(130)

      await waitForCondition(
        async () => {
          try {
            await fetch(`http://127.0.0.1:${port}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(250),
            })
            return false
          } catch {
            return true
          }
        },
        5_000,
        () => `Stubborn Host child was still reachable after SIGINT.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )

      const logs = readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(logs).toContainEqual({ action: "parent-shutdown", signal: "SIGTERM" })
      expect(logs).toContainEqual({ action: "child-ignored", signal: "SIGTERM" })
      expect(readRunelightServeSession(cwd)).toBeUndefined()
      expect(readRunelightServeLock(cwd)).toBeUndefined()
    } finally {
      if (child && child.exitCode === null) child.kill("SIGTERM")
      stopPortListeners(port)
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("adopts an active Host when the previous serve supervisor is gone", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-until-signal")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const port = await getFreePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    let host: ReturnType<typeof spawn> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      host = spawn(process.execPath, [join(cwd, "scripts/serve-studio.mjs"), "--port", port], {
        cwd,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          RUNELIGHT_DEV: "1",
          RUNELIGHT_PROJECT_KEY: projectKey,
          RUNELIGHT_SESSION_ID: sessionId,
        },
        stdio: "ignore",
      })

      await waitForCondition(
        async () => {
          try {
            const response = await fetch(`${baseUrl}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(500),
            })
            return response.status >= 200 && response.status < 400
          } catch {
            return false
          }
        },
        10_000,
        "Timed out waiting for manually started Host manifest.",
      )
      writeRunelightServeSession(cwd, {
        baseUrl,
        hostPid: host.pid ?? -1,
        mode: "runelight-dev",
        port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: 999_999_999,
      })

      const abortController = new AbortController()
      const resultPromise = runCLI(["serve"], {
        cwd,
        signal: abortController.signal,
        stdout: "",
        stderr: "",
      })
      await waitForCondition(
        () => readRunelightServeSession(cwd)?.supervisorPid === process.pid,
        5_000,
        "Timed out waiting for runelight serve to adopt the existing Host.",
      )

      abortController.abort()
      const result = await resultPromise
      expect(result).toEqual({
        exitCode: 130,
        stdout: `Runelight serve: ${baseUrl}\nStudio: ${baseUrl}/runelight/studio\n`,
        stderr: "",
      })
      await waitForCondition(
        async () => {
          try {
            await fetch(`${baseUrl}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(250),
            })
            return false
          } catch {
            return true
          }
        },
        5_000,
        "Adopted Host was still reachable after abort.",
      )
      expect(readRunelightServeSession(cwd)).toBeUndefined()
      expect(readRunelightServeLock(cwd)).toBeUndefined()

      const logs = readFileSync(logFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(logs.filter((log) => log.action === "serve")).toHaveLength(1)
      expect(logs).toContainEqual({ action: "shutdown", signal: "SIGTERM" })
    } finally {
      if (host && host.exitCode === null && host.pid !== undefined) {
        stopTestProcessTree(host.pid)
      }
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("keeps the CLI entrypoint alive while adopting an existing Host", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-until-signal")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const port = await getFreePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const childStdout: string[] = []
    const childStderr: string[] = []
    let host: ReturnType<typeof spawn> | undefined
    let child: ReturnType<typeof spawn> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      host = spawn(process.execPath, [join(cwd, "scripts/serve-studio.mjs"), "--port", port], {
        cwd,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          RUNELIGHT_DEV: "1",
          RUNELIGHT_PROJECT_KEY: projectKey,
          RUNELIGHT_SESSION_ID: sessionId,
        },
        stdio: "ignore",
      })

      await waitForCondition(
        async () => {
          try {
            const response = await fetch(`${baseUrl}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(500),
            })
            return response.status >= 200 && response.status < 400
          } catch {
            return false
          }
        },
        10_000,
        "Timed out waiting for manually started Host manifest.",
      )
      writeRunelightServeSession(cwd, {
        baseUrl,
        hostPid: host.pid ?? -1,
        mode: "runelight-dev",
        port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: 999_999_999,
      })

      child = spawn(join(repositoryRoot, "node_modules/.bin/tsx"), [join(repositoryRoot, "packages/core/src/cli.ts"), "serve"], {
        cwd,
        env: { ...process.env, RUNELIGHT_SESSION_DIR: sessionDir },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout?.on("data", (chunk) => childStdout.push(String(chunk)))
      child.stderr?.on("data", (chunk) => childStderr.push(String(chunk)))

      await waitForCondition(
        () => childStdout.join("").includes(`Runelight serve: ${baseUrl}`),
        5_000,
        () => `Timed out waiting for adopted CLI output.\nstdout:\n${childStdout.join("")}\nstderr:\n${childStderr.join("")}`,
      )
      await new Promise((resolve) => setTimeout(resolve, 750))

      expect(child.exitCode, `${childStdout.join("")}\n${childStderr.join("")}`).toBeNull()
      expect(childStderr.join("")).not.toContain("unsettled top-level await")

      const exitPromise = waitForChildExit(child, 10_000)
      child.kill("SIGINT")
      const exit = await exitPromise
      expect(exit.code).toBe(130)

      await waitForCondition(
        async () => {
          try {
            await fetch(`${baseUrl}/runelight/studio/manifest`, {
              signal: AbortSignal.timeout(250),
            })
            return false
          } catch {
            return true
          }
        },
        5_000,
        "Adopted Host was still reachable after CLI SIGINT.",
      )
      expect(readRunelightServeSession(cwd)).toBeUndefined()
      expect(readRunelightServeLock(cwd)).toBeUndefined()
    } finally {
      if (child && child.exitCode === null) child.kill("SIGTERM")
      if (host && host.exitCode === null && host.pid !== undefined) {
        stopTestProcessTree(host.pid)
      }
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("does not start the Host while another Runelight serve supervisor holds the project lock", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-until-signal")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir
    const lock = acquireRunelightServeLock(cwd)
    expect(lock.acquired).toBe(true)

    try {
      const result = await runCLI(["serve"], {
        cwd,
        stdout: "",
        stderr: "",
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("serve-supervisor-already-running")
      expect(result.stderr).toContain(`PID ${process.pid}`)
      expect(() => readFileSync(logFile, "utf8")).toThrow()
    } finally {
      if (lock.acquired) lock.release()
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("captures through the current project's active serve session by default", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }
    let server: Awaited<ReturnType<typeof startHealthyRunelightServer>> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      server = await startHealthyRunelightServer({ projectKey, sessionId })
      writeRunelightServeSession(cwd, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      const result = await runCLI(["capture", "src/Badge.g.tsx", "--frame", "neutral", "--out", "attached.png"], {
        captureBackend,
        cwd,
        stdout: "",
        stderr: "",
      })

      expect(result).toEqual({
        exitCode: 0,
        stdout: "Captured neutral to attached.png\n",
        stderr: "",
      })
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledTimes(1)
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledWith({
        cwd,
        out: "attached.png",
        url: `${server.baseUrl}/runelight?entry=src%2FBadge.g.tsx%23default&frame=neutral&chrome=0`,
        viewport: "1440x900",
      })
      expect(readRunelightServeSession(cwd)?.sessionId).toBe(sessionId)
      expect(() => readFileSync(logFile, "utf8")).toThrow()
    } finally {
      await server?.close()
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("captures an entry contact sheet when no frame is specified", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }
    let server: Awaited<ReturnType<typeof startHealthyRunelightServer>> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      server = await startHealthyRunelightServer({ projectKey, sessionId })
      writeRunelightServeSession(cwd, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      const result = await runCLI(["capture", "src/Badge.g.tsx", "--out", "contact-sheets"], {
        captureBackend,
        cwd,
        stdout: "",
        stderr: "",
      })

      expect(result).toEqual({
        exitCode: 0,
        stdout: "Captured src/Badge.g.tsx#default contact sheet to contact-sheets/Badge.png\n",
        stderr: "",
      })
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledTimes(1)
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledWith({
        cwd,
        out: "contact-sheets/Badge.png",
        url: `${server.baseUrl}/runelight?entry=src%2FBadge.g.tsx%23default`,
        viewport: "1440x900",
      })
      expect(readRunelightServeSession(cwd)?.sessionId).toBe(sessionId)
      expect(() => readFileSync(logFile, "utf8")).toThrow()
    } finally {
      await server?.close()
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("treats single-frame capture output without a png extension as a directory", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }
    let server: Awaited<ReturnType<typeof startHealthyRunelightServer>> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      server = await startHealthyRunelightServer({ projectKey, sessionId })
      writeRunelightServeSession(cwd, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      const result = await runCLI(["capture", "src/Badge.g.tsx", "--frame", "neutral", "--out", "frames"], {
        captureBackend,
        cwd,
        stdout: "",
        stderr: "",
      })

      expect(result).toEqual({
        exitCode: 0,
        stdout: "Captured neutral to frames/Badge.neutral.png\n",
        stderr: "",
      })
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledWith({
        cwd,
        out: "frames/Badge.neutral.png",
        url: `${server.baseUrl}/runelight?entry=src%2FBadge.g.tsx%23default&frame=neutral&chrome=0`,
        viewport: "1440x900",
      })
    } finally {
      await server?.close()
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("captures directory contact sheets when no frame is specified", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    const sessionDir = mkdtempSync(join(tmpdir(), "runelight-cli-sessions-"))
    const previousSessionDir = process.env.RUNELIGHT_SESSION_DIR
    const sessionId = createRunelightServeSessionId()
    const projectKey = runelightServeSessionProjectKey(cwd)
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }
    let server: Awaited<ReturnType<typeof startHealthyRunelightServer>> | undefined

    rmSync(logFile, { force: true })
    process.env.RUNELIGHT_SESSION_DIR = sessionDir

    try {
      server = await startHealthyRunelightServer({ projectKey, sessionId })
      writeRunelightServeSession(cwd, {
        baseUrl: server.baseUrl,
        hostPid: process.pid,
        mode: "runelight-dev",
        port: server.port,
        sessionId,
        startedAt: new Date().toISOString(),
        supervisorPid: process.pid,
      })

      const result = await runCLI(["capture", "src/corpus", "--out", "contact-sheets"], {
        captureBackend,
        cwd,
        stdout: "",
        stderr: "",
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Captured src/corpus/Badge.g.tsx#default contact sheet to contact-sheets/src/corpus/Badge.png")
      expect(result.stdout).toContain(
        "Captured src/corpus/StatusPanel.g.tsx#default contact sheet to contact-sheets/src/corpus/StatusPanel.png",
      )
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledTimes(2)
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledWith({
        cwd,
        out: "contact-sheets/src/corpus/Badge.png",
        url: `${server.baseUrl}/runelight?entry=src%2Fcorpus%2FBadge.g.tsx%23default`,
        viewport: "1440x900",
      })
      expect(captureBackend.capturePreviewPage).toHaveBeenCalledWith({
        cwd,
        out: "contact-sheets/src/corpus/StatusPanel.png",
        url: `${server.baseUrl}/runelight?entry=src%2Fcorpus%2FStatusPanel.g.tsx%23default`,
        viewport: "1440x900",
      })
      expect(readRunelightServeSession(cwd)?.sessionId).toBe(sessionId)
      expect(() => readFileSync(logFile, "utf8")).toThrow()
    } finally {
      await server?.close()
      if (previousSessionDir === undefined) {
        delete process.env.RUNELIGHT_SESSION_DIR
      } else {
        process.env.RUNELIGHT_SESSION_DIR = previousSessionDir
      }
      rmSync(sessionDir, { recursive: true, force: true })
      rmSync(logFile, { force: true })
    }
  })

  it("rejects the removed capture --all option", async () => {
    const result = await runCLI(["capture", "src/Badge.g.tsx", "--all"], {
      cwd: process.cwd(),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("unsupported-capture-all-option")
    expect(result.stdout).toContain("Omit --frame")
  })

  it("rejects invalid capture viewport values before using a capture backend", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }

    const result = await runCLI(["capture", "src/Badge.g.tsx", "--viewport", "wide"], {
      captureBackend,
      cwd,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("invalid-viewport")
    expect(result.stdout).toContain("1440x900")
    expect(captureBackend.capturePreviewPage).not.toHaveBeenCalled()
  })

  it("rejects invalid capture ports before loading project config or using a capture backend", async () => {
    const captureBackend = {
      capturePreviewPage: vi.fn(async () => undefined),
    }

    const result = await runCLI(["capture", "src/Badge.g.tsx", "--port", "0"], {
      captureBackend,
      cwd: process.cwd(),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("invalid-port")
    expect(result.stdout).toContain("1 to 65535")
    expect(result.stdout).not.toContain("missing-config")
    expect(captureBackend.capturePreviewPage).not.toHaveBeenCalled()
  })

  it("rejects command options that are missing values", async () => {
    const result = await runCLI(["capture", "src/Badge.g.tsx", "--frame"], {
      cwd: process.cwd(),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-option-value")
    expect(result.stdout).toContain("--frame")
    expect(result.stdout).not.toContain("missing-config")
  })

  it("requires a capture backend for programmatic capture", async () => {
    const cwd = join(import.meta.dirname, "fixtures/check-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    rmSync(logFile, { force: true })

    const result = await runCLI(["capture", "src/Badge.g.tsx", "--frame", "neutral"], {
      cwd,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-capture-backend")
    expect(() => readFileSync(logFile, "utf8")).toThrow()
  })

  it("checks directory entries from the selected TypeScript project scope", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "-p", projectRoot, "."], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/Included.g.tsx")
    expect(result.stdout).not.toContain("stories/Outside.g.tsx")
  })

  it("checks directory entries from the nearest TypeScript project scope by default", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "."], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/Included.g.tsx")
    expect(result.stdout).not.toContain("stories/Outside.g.tsx")
  })

  it("prints aggregate JSON for directory checks", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", ".", "--json"], { cwd: projectRoot, stdout: "", stderr: "" })
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(payload).toMatchObject({
      diagnostics: [],
      entries: expect.arrayContaining([
        expect.objectContaining({
          entry: "src/Included.g.tsx#default",
        }),
      ]),
    })
    expect(payload.entries.map((entry: { entry: string }) => entry.entry)).not.toContain("stories/Outside.g.tsx#default")
  })

  it("checks configured source and design entries when no check target is specified", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/check-project")

    const result = await runCLI(["check"], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Runelight pure entry: src/Badge.g.tsx#default")
    expect(result.stdout).toContain("Runelight pure entry: app/runelight/design/DesignSketch.g.tsx#default")
    expect(result.stdout).toContain("non-runelight-hook")
  })

  it("uses project.tsconfig from runelight.config.ts when the root TypeScript config only contains references", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/config-tsconfig-scope")

    const result = await runCLI(["check", "src"], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/Included.g.tsx")
  })

  it("lets explicit -p override project.tsconfig from runelight.config.ts", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/config-tsconfig-scope")

    const result = await runCLI(["check", "-p", "tsconfig.json", "src"], {
      cwd: projectRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("no-entries-found")
    expect(result.stdout).not.toContain("Runelight pure entry: src/Included.g.tsx")
  })

  it("checks named-only component files without requiring a default export", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/check-project")

    const result = await runCLI(["check", "src/MissingDefault.g.tsx"], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/MissingDefault.g.tsx#MissingDefault")
    expect(result.stdout).toContain("- ready")
  })

  it("checks every exported component in a file when no coordinate is specified", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/check-project")

    const result = await runCLI(["check", "src/MultiExport.g.tsx"], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/MultiExport.g.tsx#NamedBadge")
    expect(result.stdout).toContain("Runelight pure entry: src/MultiExport.g.tsx#default")
  })

  it("accepts check options before the entry", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/check-project")

    const result = await runCLI(["check", "--json", "src/Badge.g.tsx"], { cwd: projectRoot, stdout: "", stderr: "" })
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(payload).toMatchObject({
      entry: "src/Badge.g.tsx#default",
    })
  })

  it("still requires a default export when the explicit default coordinate is requested", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/check-project")

    const result = await runCLI(["check", "src/MissingDefault.g.tsx#default"], {
      cwd: projectRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-default-export")
  })

  it("rejects explicit entries outside the selected TypeScript project scope", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "-p", projectRoot, "stories/Outside.g.tsx"], {
      cwd: process.cwd(),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("entry-outside-project-scope")
    expect(result.stdout).toContain("stories/Outside.g.tsx is not in the selected TypeScript project scope")
  })

  it("rejects capture entries outside the selected TypeScript project scope before host setup", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["capture", "-p", projectRoot, "stories/Outside.g.tsx"], {
      cwd: process.cwd(),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("entry-outside-project-scope")
    expect(result.stdout).not.toContain("missing-config")
  })

  it("expands child frame overrides as query parameters", () => {
    expect(
      expandUrl("http://localhost:{port}/runelight?entry={entry}&frame={frame}{frameOverrides}", {
        entry: "src/frames/stateful/DashboardShell.g.tsx",
        frameName: "stagingReview",
        port: "4321",
        frameOverrides: ["src/frames/stateful/NotificationBell.g.tsx#default:expanded"],
      }),
    ).toBe(
      "http://localhost:4321/runelight?entry=src%2Fframes%2Fstateful%2FDashboardShell.g.tsx&frame=stagingReview&frameOverride=src%252Fframes%252Fstateful%252FNotificationBell.g.tsx%2523default%3Aexpanded",
    )
  })
})

function getFreePort(): Promise<string> {
  return new Promise((resolvePort, reject) => {
    const server = createTcpServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolvePort(String(address.port))
        } else {
          reject(new Error("Unable to allocate a free port"))
        }
      })
    })
  })
}

async function startHealthyRunelightServer(identity: { projectKey: string; sessionId: string }): Promise<{
  baseUrl: string
  close(): Promise<void>
  port: string
}> {
  const server = createHttpServer((request, response) => {
    if (request.url === "/runelight/studio/manifest") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ serveSession: identity }))
      return
    }

    if (request.url?.startsWith("/runelight")) {
      response.writeHead(200, { "content-type": "text/html" })
      response.end("<!doctype html><main data-runelight-preview-capture-bounds>Attached preview</main>")
      return
    }

    response.writeHead(404)
    response.end("not found")
  })

  await new Promise<void>((resolveServer, reject) => {
    server.on("error", reject)
    server.listen(0, "127.0.0.1", resolveServer)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Unable to read test server address.")

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeHttpServer(server),
    port: String(address.port),
  }
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolveServer, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolveServer()
    })
  })
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string | (() => string),
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(typeof message === "function" ? message() : message)
}

function waitForChildExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Timed out waiting for child process ${child.pid ?? ""} to exit`))
    }, timeoutMs)

    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

function stopTestProcessTree(pid: number): void {
  if (pid === process.pid) return
  if (process.platform === "win32") {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Best-effort test cleanup.
    }
    return
  }

  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // Best-effort test cleanup.
    }
  }
}

function stopPortListeners(port: string): void {
  if (process.platform === "win32") return

  const result = spawnSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  })
  for (const pidText of result.stdout.trim().split(/\s+/)) {
    const pid = Number(pidText)
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) continue
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // Best-effort test cleanup.
    }
  }
}
