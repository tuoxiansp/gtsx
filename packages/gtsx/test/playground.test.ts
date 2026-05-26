import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { runCLI } from "../src/cli.js"

type PlaygroundProject = {
  name: string
  snapshotName: string
  root: string
  entry: string
  expectedCases: string[]
}

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const snapshotsRoot = join(repositoryRoot, "snapshots")
const projects: PlaygroundProject[] = [
  {
    name: "TanStack Start root provider error",
    snapshotName: "tanstack-start-root-provider-error",
    root: join(repositoryRoot, "playground/tanstack-start-root-provider-error"),
    entry: "src/routes/__root.g.tsx",
    expectedCases: ["apiDown", "recovering", "ready"],
  },
  {
    name: "Next.js App Router init structure",
    snapshotName: "next-app-router-init-structure",
    root: join(repositoryRoot, "playground/next-app-router-init-structure"),
    entry: "components/AppShell.g.tsx",
    expectedCases: ["firstLoad", "routeHandlerTrouble"],
  },
  {
    name: "Vite React TS TanStack Router scaffold",
    snapshotName: "vite-react-ts-tanstack-router",
    root: join(repositoryRoot, "playground/vite-react-ts-tanstack-router"),
    entry: "src/routes/AppRoute.g.tsx",
    expectedCases: ["createVitePnpmFailure", "generatedFirstRoute", "ready"],
  },
]

describe("playground full-chain examples", () => {
  beforeEach(() => {
    for (const project of projects) {
      rmSync(join(project.root, ".gtsx-artifacts"), { recursive: true, force: true })
    }
  })

  afterEach(() => {
    for (const project of projects) {
      rmSync(join(project.root, ".gtsx-artifacts"), { recursive: true, force: true })
    }
  })

  it.each(projects)("$name exposes statically enumerable GTSX cases", async (project) => {
    const check = await runCLI(["check", project.entry, "--json"], {
      cwd: project.root,
      stdout: "",
      stderr: "",
    })
    expect(check.exitCode).toBe(0)
    expect(JSON.parse(check.stdout).cases.map((testCase: { name: string }) => testCase.name)).toEqual(
      project.expectedCases,
    )
  })

  it("captures a real contact sheet from the Next.js preview route", async () => {
    const project = projects.find((candidate) => candidate.snapshotName === "next-app-router-init-structure")
    if (!project) throw new Error("Missing Next.js playground project")
    rmSync(join(snapshotsRoot, project.snapshotName), { recursive: true, force: true })

    const capture = await runCLI(
      ["capture", project.entry, "--all", "--port", "4312", "--out", `../../snapshots/${project.snapshotName}`],
      {
        cwd: project.root,
        stdout: "",
        stderr: "",
      },
    )
    expect(capture, `${capture.stdout}\n${capture.stderr}`).toMatchObject({ exitCode: 0 })

    const snapshot = join(snapshotsRoot, project.snapshotName, "AppShell.png")
    expect(existsSync(snapshot)).toBe(true)
    expect(readFileSync(snapshot).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(statSync(snapshot).size).toBeGreaterThan(10_000)
  }, 60_000)

  it("serves the Studio manifest from the Next.js project route", async () => {
    const project = projects.find((candidate) => candidate.snapshotName === "next-app-router-init-structure")
    if (!project) throw new Error("Missing Next.js playground project")

    const port = "4313"
    const server = spawn("npm", ["run", "dev", "--", "--port", port], {
      cwd: project.root,
      shell: true,
      stdio: "ignore",
    })

    try {
      const response = await fetchJsonWhenReady(`http://localhost:${port}/gtsx/studio/manifest`)

      expect(response).toMatchObject({
        version: 1,
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        files: [
          {
            path: "components/AppShell.g.tsx",
            components: [
              {
                coordinate: "components/AppShell.g.tsx#default",
                componentName: "AppShell",
                exportName: "default",
                mode: "pure",
                cases: [
                  { kind: "pure", name: "firstLoad" },
                  { kind: "pure", name: "routeHandlerTrouble" },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          },
        ],
        diagnostics: [],
      })
    } finally {
      server.kill()
    }
  }, 60_000)

  it("serves the Studio shell from the Next.js project route", async () => {
    const project = projects.find((candidate) => candidate.snapshotName === "next-app-router-init-structure")
    if (!project) throw new Error("Missing Next.js playground project")

    const port = "4314"
    const server = spawn("npm", ["run", "dev", "--", "--port", port], {
      cwd: project.root,
      shell: true,
      stdio: "ignore",
    })

    try {
      const html = await fetchTextWhenReady(`http://localhost:${port}/gtsx/studio`)
      const normalizedHtml = html.replaceAll("&amp;", "&")

      expect(html).toContain("GTSX Studio")
      expect(html).toContain("components/AppShell.g.tsx")
      expect(html).toContain("AppShell")
      expect(html).toContain("components/AppShell.g.tsx#default")
      expect(html).toContain("firstLoad")
      expect(html).toContain("routeHandlerTrouble")
      expect(html).toContain('data-gtsx-card-coordinate="components/AppShell.g.tsx#default"')
      expect(html).not.toContain("selection=component%3Acomponents%2FAppShell.g.tsx%23default")
      expect(normalizedHtml).toContain(
        'data-gtsx-preview-src="/gtsx?entry=components%2FAppShell.g.tsx%23default&case=firstLoad&chrome=0&sessionId=components%2FAppShell.g.tsx%23default%3AfirstLoad"',
      )
      expect(normalizedHtml).not.toContain(
        '<iframe src="/gtsx?entry=components%2FAppShell.g.tsx%23default&case=firstLoad&chrome=0&sessionId=components%2FAppShell.g.tsx%23default%3AfirstLoad"',
      )

      const previewHtml = await fetchTextWhenReady(`http://localhost:${port}/gtsx?case=firstLoad`)
      expect(previewHtml).toContain("Root route is present.")
      expect(previewHtml).not.toContain("GTSX Studio")
    } finally {
      server.kill()
    }
  }, 60_000)
})

async function fetchJsonWhenReady(url: string): Promise<unknown> {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
      lastError = new Error(`Unexpected ${response.status} from ${url}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}

async function fetchTextWhenReady(url: string): Promise<string> {
  const deadline = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.text()
      lastError = new Error(`Unexpected ${response.status} from ${url}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`)
}
