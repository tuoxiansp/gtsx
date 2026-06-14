import { parentPort, workerData } from "node:worker_threads"

import {
  createStudioWorkspaceChangesSyncProvider,
  type StudioWorkspaceChangesWorkerData,
} from "./manifest-server"

type StudioWorkspaceChangesWorkerRequest = {
  id: number
  type: "changes"
}

const port = parentPort
if (!port) throw new Error("Runelight Studio changes worker requires a parent port.")

const createChangesPromise = createStudioWorkspaceChangesSyncProvider(workerData as StudioWorkspaceChangesWorkerData)

port.on("message", async (message: unknown) => {
  if (!isStudioWorkspaceChangesWorkerRequest(message)) return

  try {
    const createChanges = await createChangesPromise
    port.postMessage({
      id: message.id,
      ok: true,
      changes: createChanges(),
    })
  } catch (error) {
    port.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : "Runelight Studio changes worker failed.",
    })
  }
})

function isStudioWorkspaceChangesWorkerRequest(value: unknown): value is StudioWorkspaceChangesWorkerRequest {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<StudioWorkspaceChangesWorkerRequest>
  return candidate.type === "changes" && typeof candidate.id === "number"
}
