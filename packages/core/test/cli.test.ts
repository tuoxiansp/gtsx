import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { expandUrl } from "../src/cli.js"
import { runCLI } from "../src/cli.js"

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
    expect(result.stdout).toContain("runelight check [-p <tsconfig-or-dir>] <entry.g.tsx|entry.g.vue[#export]|dir>")
  })

  it("prints help for the public command surface", async () => {
    const result = await runCLI(["--help"], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("runelight check [-p <tsconfig-or-dir>] <entry.g.tsx|entry.g.vue[#export]|dir>")
    expect(result.stdout).toContain("runelight serve [-p <tsconfig-or-dir>] [--port <port>]")
    expect(result.stdout).toContain("--frame-override <entry#export:frame>")
    expect(result.stdout).toContain("runelight capture [-p <tsconfig-or-dir>] <entry.g.tsx|entry.g.vue[#export]|dir>")
  })

  it("serves the project Studio URL without requiring a component entry", async () => {
    const cwd = join(import.meta.dirname, "fixtures/serve-project")
    const logFile = join(cwd, "runelight-command-log.jsonl")
    rmSync(logFile, { force: true })

    const result = await runCLI(["serve", "--port", "4555"], { cwd, stdout: "", stderr: "" })

    expect(result).toEqual({
      exitCode: 0,
      stdout: "Studio: http://localhost:4555/runelight/studio\n",
      stderr: "",
    })
    expect(readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      { action: "serve", args: ["--port", "4555"] },
      { action: "ready-check", path: "/runelight/studio" },
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
    expect(result.stderr).toContain("http://localhost:4556/runelight/studio")
  })

  it("checks directory entries from the selected TypeScript project scope", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/ts-project-scope")

    const result = await runCLI(["check", "-p", projectRoot, "."], { cwd: process.cwd(), stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
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

  it("uses project.tsconfig from runelight.config.ts when the root TypeScript config only contains references", async () => {
    const projectRoot = join(import.meta.dirname, "fixtures/config-tsconfig-scope")

    const result = await runCLI(["check", "src"], { cwd: projectRoot, stdout: "", stderr: "" })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Runelight pure entry: src/Included.g.tsx")
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
      "http://localhost:4321/runelight?entry=src%2Fframes%2Fstateful%2FDashboardShell.g.tsx&frame=stagingReview&frameOverride=src%2Fframes%2Fstateful%2FNotificationBell.g.tsx%23default%3Aexpanded",
    )
  })
})
