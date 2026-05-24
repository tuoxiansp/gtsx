import { createRoot } from "react-dom/client"
import { StudioShell } from "gtsx/studio/client"
import studioManifest from "virtual:gtsx/studio-manifest"

import { GTSXPreviewApp } from "./preview"
import "./styles.css"

const app = window.location.pathname === "/gtsx/studio" ? <StudioShell manifest={studioManifest} /> : <GTSXPreviewApp />

createRoot(document.getElementById("root")!).render(app)
