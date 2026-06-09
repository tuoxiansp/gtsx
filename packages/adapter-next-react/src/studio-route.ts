import { readFileSync, statSync } from "node:fs"
import { extname, resolve } from "node:path"

import type { RunelightConfig } from "@runelight/core"

export type RunelightNextStudioResponseOptions = {
  enabled?: boolean
  studioAppDirectory?: string
}

export type RunelightNextStudioManifestResponseOptions = {
  config?: RunelightConfig
  cwd?: string
  enabled?: boolean
}

type StudioManifestServerModule = {
  createStudioManifestProvider(options?: { config?: RunelightConfig; cwd?: string }): () => unknown
}

type StudioStaticAppModule = {
  resolveRunelightStudioAppAssetPath(assetPath?: string): string
}

const studioManifestServerModuleId = "@runelight/studio/manifest-server"
const studioStaticAppModuleId = "@runelight/studio/static-app"

export async function createRunelightNextStudioResponse(
  options: RunelightNextStudioResponseOptions = {},
): Promise<Response> {
  return createRunelightNextStudioAssetResponse("index.html", options)
}

export async function createRunelightNextStudioAssetResponse(
  assetPath: string | string[],
  options: RunelightNextStudioResponseOptions = {},
): Promise<Response> {
  if (!isRunelightNextStudioEnabled(options)) return notFoundResponse()

  const normalizedAssetPath = normalizeRunelightNextStudioAssetPath(assetPath)
  const filePath = await resolveRunelightNextStudioAssetFilePath(normalizedAssetPath, options)
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
  if (!isRunelightNextStudioEnabled(options)) return notFoundResponse()

  const { createStudioManifestProvider } = await import(studioManifestServerModuleId) as StudioManifestServerModule
  return Response.json(createStudioManifestProvider({ config: options.config, cwd: options.cwd })())
}

async function resolveRunelightNextStudioAssetFilePath(
  assetPath: string,
  options: Pick<RunelightNextStudioResponseOptions, "studioAppDirectory">,
): Promise<string> {
  if (options.studioAppDirectory) return resolve(options.studioAppDirectory, assetPath)

  const { resolveRunelightStudioAppAssetPath } = await import(studioStaticAppModuleId) as StudioStaticAppModule
  return resolveRunelightStudioAppAssetPath(assetPath)
}

function isRunelightNextStudioEnabled(options: { enabled?: boolean }): boolean {
  return options.enabled ?? process.env.RUNELIGHT_DEV === "1"
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
