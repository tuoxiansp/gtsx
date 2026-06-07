import { createApp } from "vue"

import App from "./App.vue"
import "./styles.css"

void renderApp()

async function renderApp() {
  if (import.meta.env.DEV && window.location.pathname === "/runelight") {
    const { createRunelightVuePreviewApp } = await import("./preview.js")
    createApp(createRunelightVuePreviewApp()).mount("#app")
    return
  }

  createApp(App).mount("#app")
}
