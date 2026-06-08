import { createRoot } from "react-dom/client"

import { WebsiteApp } from "./app/WebsiteApp"
import "./styles.css"

const root = createRoot(document.getElementById("root")!)

void renderApp()

async function renderApp() {
  if (import.meta.env.DEV && window.location.pathname === "/runelight") {
    const { RunelightPreviewApp } = await import("./preview")
    root.render(<RunelightPreviewApp />)
    return
  }

  root.render(<WebsiteApp />)
}
