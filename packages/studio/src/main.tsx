import { createRoot } from "react-dom/client"
import { StudioShell, createStudioManifestFromRunelightConfig } from "@runelight/studio"
import runelightConfig from "virtual:runelight/config"
import projectIndex from "virtual:runelight/project-index"

import { RunelightPreviewApp } from "./preview"

const studioManifest = createStudioManifestFromRunelightConfig(projectIndex, runelightConfig)
const app = window.location.pathname === "/runelight/studio" ? <StudioShell manifest={studioManifest} /> : <RunelightPreviewApp />

createRoot(document.getElementById("root")!).render(app)
