import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightPreviewRouteParams,
  type RunelightPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import runelightConfig from "virtual:runelight/config"

import "./styles.css"
import "./frames/preview.css"

const modules = import.meta.glob<RunelightPreviewModule>(["./app/**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"])
const loadWebsitePreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: runelightConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadWebsitePreviewComponent}
      missingEntryDetail="Pass ?entry=src/app/.../*.g.tsx to render a website component frame."
    />
  )
}
