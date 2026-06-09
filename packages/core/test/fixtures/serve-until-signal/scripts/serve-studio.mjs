import { appendFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"

const logFile = join(process.cwd(), "runelight-command-log.jsonl")
const port = readOption(process.argv.slice(2), "--port") ?? "0"

appendLog({ action: "serve", port, runelightDev: process.env.RUNELIGHT_DEV })

const server = createServer((request, response) => {
  if (request.url === "/runelight/studio/manifest") {
    appendLog({
      action: "ready-check",
      path: "/runelight/studio/manifest",
      projectKey: process.env.RUNELIGHT_PROJECT_KEY,
      sessionId: process.env.RUNELIGHT_SESSION_ID,
    })
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        version: 1,
        serveSession: {
          projectKey: process.env.RUNELIGHT_PROJECT_KEY,
          sessionId: process.env.RUNELIGHT_SESSION_ID,
        },
        routes: {
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
        },
        preview: {
          urlTemplate: "/runelight?entry={entry}&frame={frame}{frameOverrides}",
          allUrlTemplate: "/runelight?entry={entry}{frameOverrides}",
        },
        files: [],
        diagnostics: [],
      }),
    )
    return
  }

  if (request.url === "/runelight/studio") {
    appendLog({ action: "ready-check", path: "/runelight/studio" })
    response.writeHead(200, { "content-type": "text/html" })
    response.end("<!doctype html><title>Runelight Studio</title>")
    return
  }

  response.writeHead(404)
  response.end("not found")
})

server.listen(Number(port), "127.0.0.1")

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))

function shutdown(signal) {
  appendLog({ action: "shutdown", signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1_000).unref()
}

function appendLog(value) {
  appendFileSync(logFile, `${JSON.stringify(value)}\n`)
}

function readOption(args, optionName) {
  const index = args.indexOf(optionName)
  return index >= 0 ? args[index + 1] : undefined
}
