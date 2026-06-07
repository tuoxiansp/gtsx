import { existsSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

const checkProjectRoot = join(import.meta.dirname, "fixtures/check-project")
const serveProjectRoot = join(import.meta.dirname, "fixtures/serve-project")
const checkProjectLogFile = join(checkProjectRoot, "runelight-command-log.jsonl")
const serveProjectLogFile = join(serveProjectRoot, "runelight-command-log.jsonl")

describe("Runelight preview commands", () => {
  beforeEach(() => {
    rmSync(checkProjectLogFile, { force: true })
    rmSync(serveProjectLogFile, { force: true })
  })

  afterEach(() => {
    rmSync(checkProjectLogFile, { force: true })
    rmSync(serveProjectLogFile, { force: true })
    rmSync(join(checkProjectRoot, "shots"), { recursive: true, force: true })
  })

  it("serves the project Studio without requiring a component entry", async () => {
    const port = await getFreePort()
    const result = await runCLI(["serve", "--port", port], {
      cwd: serveProjectRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(readLog(serveProjectLogFile)).toEqual([
      {
        action: "serve",
        args: ["--port", port],
      },
      {
        action: "ready-check",
        path: "/runelight/studio",
      },
    ])
  })

  it("does not pass component frame overrides to the project-level serve command", async () => {
    const port = await getFreePort()
    const result = await runCLI(
      [
        "serve",
        "--frame-override",
        "src/Child.g.tsx#Child:open",
        "--frame-override",
        "src/Menu.g.tsx#default:closed",
        "--port",
        port,
      ],
      {
        cwd: serveProjectRoot,
        stdout: "",
        stderr: "",
      },
    )

    expect(result.exitCode).toBe(0)
    expect(readLog(serveProjectLogFile)).toEqual([
      {
        action: "serve",
        args: ["--port", port],
      },
      {
        action: "ready-check",
        path: "/runelight/studio",
      },
    ])
  })

  it("does not require a strip command while strip integration is not configured", async () => {
    const result = await runCLI(["strip", "--check"], {
      cwd: checkProjectRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("missing-strip-script")
    expect(existsSync(checkProjectLogFile)).toBe(false)
  })

  it("requires an all-frames preview URL before capturing a contact sheet", async () => {
    const result = await runCLI(["capture", "src/Badge.g.tsx", "--all"], {
      cwd: checkProjectRoot,
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-preview-all-url")
    expect(existsSync(checkProjectLogFile)).toBe(false)
  })
})

function readLog(logFile: string) {
  return readFileSync(logFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
}

function getFreePort(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(String(address.port))
        } else {
          reject(new Error("Unable to allocate a test port."))
        }
      })
    })
  })
}
