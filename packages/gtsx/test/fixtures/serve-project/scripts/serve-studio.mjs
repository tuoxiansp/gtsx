import { appendFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"

const logFile = join(process.cwd(), "gtsx-command-log.jsonl")
const port = readOption(process.argv.slice(2), "--port") ?? "0"

appendFileSync(logFile, `${JSON.stringify({ action: "serve", args: ["--port", port] })}\n`)

const server = createServer((request, response) => {
  if (request.url === "/gtsx/studio") {
    appendFileSync(logFile, `${JSON.stringify({ action: "ready-check", path: "/gtsx/studio" })}\n`)
    response.writeHead(200, { "content-type": "text/html" })
    response.end("<!doctype html><title>GTSX Studio</title>")
    setTimeout(() => server.close(), 25)
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
