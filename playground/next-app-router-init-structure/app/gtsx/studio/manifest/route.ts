import { getStudioManifest } from "../studio-manifest"

export function GET() {
  return Response.json(getStudioManifest())
}
