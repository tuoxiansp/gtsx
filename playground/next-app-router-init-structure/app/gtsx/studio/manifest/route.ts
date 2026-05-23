import { buildStudioManifest } from "gtsx/studio/server"

export function GET() {
  return Response.json(
    buildStudioManifest({
      cwd: ".",
      projectRoot: "components",
    }),
  )
}
