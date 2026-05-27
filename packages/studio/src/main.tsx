import { createRoot } from "react-dom/client"
import { StudioShell, createStudioManifestFromGTSXConfig } from "@gtsx/studio"
import gtsxConfig from "virtual:gtsx/config"
import projectIndex from "virtual:gtsx/project-index"

import { GTSXPreviewApp } from "./preview"

const studioManifest = createStudioManifestFromGTSXConfig(projectIndex, gtsxConfig)
const app = window.location.pathname === "/gtsx/studio" ? <StudioShell manifest={studioManifest} /> : <GTSXPreviewApp />

createRoot(document.getElementById("root")!).render(app)
