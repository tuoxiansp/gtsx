import { spawn } from "node:child_process"
import { appendFileSync } from "node:fs"
import { join } from "node:path"

const logFile = join(process.cwd(), "runelight-command-log.jsonl")
const port = readOption(process.argv.slice(2), "--port") ?? "0"

appendLog({ action: "parent-start", port })

const child = spawn(process.execPath, [join(process.cwd(), "scripts/stubborn-child.mjs"), "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "ignore",
})
child.unref()

const keepAlive = setInterval(() => {}, 60_000)

process.once("SIGTERM", () => {
  appendLog({ action: "parent-shutdown", signal: "SIGTERM" })
  clearInterval(keepAlive)
  process.exit(0)
})

process.once("SIGINT", () => {
  appendLog({ action: "parent-shutdown", signal: "SIGINT" })
  clearInterval(keepAlive)
  process.exit(0)
})

function appendLog(value) {
  appendFileSync(logFile, `${JSON.stringify(value)}\n`)
}

function readOption(args, optionName) {
  const index = args.indexOf(optionName)
  return index >= 0 ? args[index + 1] : undefined
}
