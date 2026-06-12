import { createRoot } from "react-dom/client"

import "./styles.css"

const root = createRoot(document.getElementById("root")!)

void renderApp()

async function renderApp() {
  if (__RUNELIGHT_DEV__ && window.location.pathname === "/runelight") {
    const { RunelightPreviewApp } = await import("./preview")
    root.render(<RunelightPreviewApp />)
    return
  }

  root.render(<div />)
}
