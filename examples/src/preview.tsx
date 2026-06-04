import {
  createGTSXVitePreviewComponentLoader,
  GTSXVitePreviewClient,
  readGTSXPreviewRouteParams,
  type GTSXPreviewModule,
} from "@gtsx/adapter-vite-react/preview"
import gtsxConfig from "virtual:gtsx/config"

const modules = import.meta.glob<GTSXPreviewModule>(["./frames/**/*.g.tsx", "/app/gtsx/design/**/*.g.tsx"])
const loadExamplePreviewComponent = createGTSXVitePreviewComponentLoader(modules, {
  sourceRoot: gtsxConfig.project.sourceRoot,
})

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <GTSXVitePreviewClient
      {...params}
      loadComponent={loadExamplePreviewComponent}
      missingEntryDetail="Pass ?entry=src/frames/.../*.g.tsx to render a GTSX example."
    />
  )
}
