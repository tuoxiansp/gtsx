import { appendFileSync } from "node:fs"
import { join } from "node:path"

const logFile = join(process.cwd(), "gtsx-command-log.jsonl")
const [action, ...args] = process.argv.slice(2)

appendFileSync(logFile, `${JSON.stringify({ action, args })}\n`)
process.stdout.write(`recorded ${action}\n`)
