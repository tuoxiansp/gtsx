import { readFileSync, statSync } from "node:fs"
import { extname } from "node:path"

import type { RunelightConfig } from "@runelight/core"
import { isRunelightNextRouteEnabled } from "./route-enablement.js"

export type RunelightNextStudioResponseOptions = {
  config?: RunelightConfig
  cwd?: string
}

export type RunelightNextStudioManifestResponseOptions = RunelightNextStudioResponseOptions

type StudioManifestServerModule = {
  createStudioManifestProvider(options?: { config?: RunelightConfig; cwd?: string }): Promise<() => unknown>
}

type StudioStaticAppModule = {
  resolveRunelightStudioAppAssetPath(assetPath?: string): string
}

export async function createRunelightNextStudioResponse(
  options: RunelightNextStudioResponseOptions = {},
): Promise<Response> {
  return createRunelightNextStudioAssetResponse("index.html", options)
}

export async function createRunelightNextStudioAssetResponse(
  assetPath: string | string[],
  options: RunelightNextStudioResponseOptions = {},
): Promise<Response> {
  if (!isRunelightNextRouteEnabled(options)) return notFoundResponse()

  const normalizedAssetPath = normalizeRunelightNextStudioAssetPath(assetPath)
  const filePath = await resolveRunelightNextStudioAssetFilePath(normalizedAssetPath)
  const fileStat = statIfFile(filePath)
  if (!fileStat) return new Response("Runelight Studio asset not found.", { status: 404 })

  return new Response(readFileSync(filePath), {
    headers: {
      "content-length": String(fileStat.size),
      "content-type": studioAssetContentType(filePath),
    },
    status: 200,
  })
}

export async function createRunelightNextStudioManifestResponse(
  options: RunelightNextStudioManifestResponseOptions = {},
): Promise<Response> {
  if (!isRunelightNextRouteEnabled(options)) return notFoundResponse()

  const { createStudioManifestProvider } = await import("@runelight/studio/manifest-server") as StudioManifestServerModule
  const createManifest = await createStudioManifestProvider({ config: options.config, cwd: options.cwd })
  return Response.json(createManifest())
}

async function resolveRunelightNextStudioAssetFilePath(assetPath: string): Promise<string> {
  const { resolveRunelightStudioAppAssetPath } = await import("@runelight/studio/static-app") as StudioStaticAppModule
  return resolveRunelightStudioAppAssetPath(assetPath)
}

function normalizeRunelightNextStudioAssetPath(assetPath: string | string[]): string {
  const rawAssetPath = Array.isArray(assetPath) ? `assets/${assetPath.join("/")}` : assetPath
  const normalized = rawAssetPath.replace(/^\/+/, "")

  if (normalized === "" || normalized.split("/").includes("..")) {
    throw new Error(`Invalid Runelight Studio asset path: ${Array.isArray(assetPath) ? assetPath.join("/") : assetPath}`)
  }

  return normalized
}

function studioAssetContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8"
    case ".html":
      return "text/html; charset=utf-8"
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

function statIfFile(filePath: string) {
  try {
    const fileStat = statSync(filePath)
    return fileStat.isFile() ? fileStat : undefined
  } catch {
    return undefined
  }
}

function notFoundResponse(): Response {
  return new Response(null, { status: 404 })
}
