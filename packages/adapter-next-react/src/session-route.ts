import { isRunelightNextRouteEnabled } from "./route-enablement.js"

const runelightProjectKeyEnvName = "RUNELIGHT_PROJECT_KEY"
const runelightSessionIdEnvName = "RUNELIGHT_SESSION_ID"

export function createRunelightNextSessionResponse(): Response {
  if (!isRunelightNextRouteEnabled()) return notFoundResponse()

  return Response.json(
    {
      serveSession: {
        projectKey: process.env[runelightProjectKeyEnvName],
        sessionId: process.env[runelightSessionIdEnvName],
      },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  )
}

function notFoundResponse(): Response {
  return new Response(null, { status: 404 })
}
