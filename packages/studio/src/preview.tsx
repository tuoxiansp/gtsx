import {
  createGTSXVitePreviewComponentLoader,
  GTSXVitePreviewClient,
  readGTSXPreviewRouteParams,
  type GTSXPreviewModule,
} from "@gtsx/adapter-vite-react/preview"
import gtsxConfig from "virtual:gtsx/config"

const modules = import.meta.glob<GTSXPreviewModule>(["./components/**/*.g.tsx", "/app/gtsx/design/**/*.g.tsx"])
const loadStudioPreviewComponent = createGTSXVitePreviewComponentLoader(modules, {
  sourceRoot: gtsxConfig.project.sourceRoot,
})

export function GTSXPreviewApp() {
  const params = readGTSXPreviewRouteParams(new URLSearchParams(window.location.search))

  return (
    <GTSXVitePreviewClient
      {...params}
      loadComponent={loadStudioPreviewComponent}
      missingEntryDetail="Pass ?entry=src/components/.../*.g.tsx to render a Studio package frame."
    />
  )
}
