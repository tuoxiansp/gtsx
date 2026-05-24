import { createStudioManifest } from "@gtsx/studio"
import { buildGTSXProjectIndex } from "gtsx/project-index"

export function GET() {
  return Response.json(createStudioManifest(buildGTSXProjectIndex({ cwd: ".", projectRoot: "components" })))
}
