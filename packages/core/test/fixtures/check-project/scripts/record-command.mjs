import { appendFileSync } from "node:fs"
import { join } from "node:path"

const logFile = join(process.cwd(), "runelight-command-log.jsonl")
const [action, ...args] = process.argv.slice(2)

appendFileSync(logFile, `${JSON.stringify({ action, args, runelightDev: process.env.RUNELIGHT_DEV })}\n`)
process.stdout.write(`recorded ${action}\n`)
