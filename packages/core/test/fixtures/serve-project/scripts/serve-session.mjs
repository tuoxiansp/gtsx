import { appendFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"

const logFile = join(process.cwd(), "runelight-command-log.jsonl")
const port = readOption(process.argv.slice(2), "--port") ?? "0"
let sessionRequestCount = 0

appendFileSync(logFile, `${JSON.stringify({ action: "serve", args: ["--port", port], runelightDev: process.env.RUNELIGHT_DEV })}\n`)

const server = createServer((request, response) => {
  if (request.url === "/runelight/session") {
    sessionRequestCount += 1
    appendFileSync(logFile, `${JSON.stringify({ action: "ready-check", path: "/runelight/session" })}\n`)
    if (sessionRequestCount === 1) {
      response.writeHead(503, { "content-type": "text/plain" })
      response.end("session still starting")
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        version: 1,
        serveSession: {
          projectKey: process.env.RUNELIGHT_PROJECT_KEY,
          sessionId: process.env.RUNELIGHT_SESSION_ID,
        },
      }),
    )
    setTimeout(() => server.close(), 500)
    return
  }

  response.writeHead(404)
  response.end("not found")
})

server.listen(Number(port), "127.0.0.1")

function readOption(args, optionName) {
  const index = args.indexOf(optionName)
  return index >= 0 ? args[index + 1] : undefined
}
