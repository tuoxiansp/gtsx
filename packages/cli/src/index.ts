#!/usr/bin/env node

import { runCLI } from "@runelight/core/cli"
import { playwrightBrowserCaptureBackend } from "./browser-capture.js"

const abortController = new AbortController()
process.once("SIGINT", () => abortController.abort())
process.once("SIGTERM", () => abortController.abort())

const result = await runCLI(process.argv.slice(2), {
  captureBackend: playwrightBrowserCaptureBackend,
  cwd: process.cwd(),
  hostStdio: "inherit",
  signal: abortController.signal,
  stdout: "",
  stderr: "",
  writeStderr: (chunk) => process.stderr.write(chunk),
  writeStdout: (chunk) => process.stdout.write(chunk),
})

if (result.stdout && !abortController.signal.aborted) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = result.exitCode
