import { createRoot } from "react-dom/client"
import { StudioShell } from "gtsx/studio/client"
import { createStudioManifest } from "gtsx/studio/manifest"
import projectIndex from "virtual:gtsx/project-index"

import { GTSXPreviewApp } from "./preview"

const studioManifest = createStudioManifest(projectIndex)
const app = window.location.pathname === "/gtsx/studio" ? <StudioShell manifest={studioManifest} /> : <GTSXPreviewApp />

createRoot(document.getElementById("root")!).render(app)
