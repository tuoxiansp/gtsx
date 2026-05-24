import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { expandUrl } from "../src/cli.js"
import { runCLI } from "../src/cli.js"

const repositoryRoot = resolve(import.meta.dirname, "../../..")

describe("gtsx CLI", () => {
  it("prints help when invoked through a package manager bin symlink", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "gtsx-cli-"))
    const linkedEntrypoint = join(tempDirectory, "node_modules/gtsx/src/cli.ts")

    mkdirSync(join(tempDirectory, "node_modules/gtsx/src"), { recursive: true })
    symlinkSync(join(import.meta.dirname, "../src/cli.ts"), linkedEntrypoint)
    const result = spawnSync("pnpm", ["exec", "tsx", linkedEntrypoint, "--help"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    })

    expect(result, `${result.stdout}\n${result.stderr}`).toMatchObject({ status: 0 })
    expect(result.stdout).toContain("gtsx check [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir>")
  })

  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("gtsx check [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir>")
    expect(result.stdout).toContain("gtsx serve [-p <tsconfig-or-dir>] [--port <port>]")
    expect(result.stdout).toContain("--gcase <entry.g.tsx#export:case>")
    expect(result.stdout).toContain("gtsx capture [-p <tsconfig-or-dir>] <entry.g.tsx[#export]|dir>")
  })

  it("serves the project Studio URL without requiring a component entry", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-project")
    const logFile = join(cwd, "gtsx-command-log.jsonl")
    rmSync(logFile, { force: true })

    const result = await runCLI(["serve", "--port", "4555"], { cwd, stdout: "", stderr: "" })

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Studio: http://localhost:4555/gtsx/studio\n",
      stderr: "",
    })
    expect(readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { action: "serve", args: ["--port", "4555"] },
      { action: "ready-check", path: "/gtsx/studio" },
    ])
  })

  it("reports missing Studio route integration for project-level serve", async () => {
    const result = await runCLI(["serve"], {
      cwd: join(import.meta.dirname, "fixtures/missing-studio-url"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing-studio-url")
    expect(result.stdout).toContain("Add preview.studioUrl")
  })

  it("reports when the preview server exits before the Studio route is reachable", async () => {
    const result = await runCLI(["serve", "--port", "4556"], {
      cwd: join(import.meta.dirname, "fixtures/serve-exits-before-ready"),
      stdout: "",
      stderr: "",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("preview-server-not-ready")
    expect(result.stderr).toContain("http://localhost:4556/gtsx/studio")
  })

  it("checks directory entries from the selected TypeScript project scope", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "-p", projectRoot, "."], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("GTSX pure entry: src/Included.g.tsx")
    expect(result.stdout).not.toContain("stories/Outside.g.tsx")
  })

  it("checks directory entries from the nearest TypeScript project scope by default", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "."], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("GTSX pure entry: src/Included.g.tsx")
    expect(result.stdout).not.toContain("stories/Outside.g.tsx")
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

  it("expands child case overrides as query parameters", () => {
    expect(
      expandUrl("http://localhost:{port}/gtsx?entry={entry}&case={case}{gcase}", {
        entry: "src/cases/stateful/DashboardShell.g.tsx",
        caseName: "stagingReview",
        port: "4321",
        gcases: ["src/cases/stateful/NotificationBell.g.tsx#default:expanded"],
      }),
    ).toBe(
      "http://localhost:4321/gtsx?entry=src%2Fcases%2Fstateful%2FDashboardShell.g.tsx&case=stagingReview&gcase=src%2Fcases%2Fstateful%2FNotificationBell.g.tsx%23default%3Aexpanded",
    )
  })
})
