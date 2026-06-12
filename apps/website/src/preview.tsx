import {
  createRunelightVitePreviewComponentLoader,
  RunelightVitePreviewClient,
  readRunelightReactPreviewRouteParams,
  type RunelightReactPreviewModule,
} from "@runelight/adapter-vite-react/preview"
import previewConfig from "virtual:runelight/preview-config"

import "./styles.css"
import "./frames/preview.css"
import "./frames/website-design-explore.css"

const modules = import.meta.glob<RunelightReactPreviewModule>(["/src/app/**/*.g.tsx", "/app/runelight/design/**/*.g.tsx"], {
  query: "?runelight-preview",
})
const loadWebsitePreviewComponent = createRunelightVitePreviewComponentLoader(modules, {
  sourceRoot: previewConfig.project.sourceRoot,
})

export function RunelightPreviewApp() {
  const params = readRunelightReactPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <RunelightVitePreviewClient
      {...params}
      loadComponent={loadWebsitePreviewComponent}
      missingEntryDetail="Pass ?entry=src/app/.../*.g.tsx to render a website component frame."
    />
  )
}
