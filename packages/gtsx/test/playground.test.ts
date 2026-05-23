import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
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
})
