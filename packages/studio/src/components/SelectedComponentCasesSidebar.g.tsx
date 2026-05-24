import type { GCases } from "gtsx"

import { mergeStudioPreviewFrameState, previewSessionId, studioPreviewCacheKey, type StudioPreviewCacheEntry } from "../client"
import type { StudioManifest, StudioManifestComponent } from "../manifest"
import CasePreviewCard from "./CasePreviewCard.g"

type SelectedComponentCasesSidebarProps = {
  component: StudioManifestComponent
  manifest: StudioManifest
  onChangeCase?: (component: StudioManifestComponent, caseName: string, options?: { keepDrilldown?: boolean }) => void
  previewCache?: Record<string, StudioPreviewCacheEntry>
  selectedCaseName: string
  viewportPreset: "phone" | "tablet" | "desktop"
}

export default function SelectedComponentCasesSidebar(props: SelectedComponentCasesSidebarProps) {
  return (
    <aside
      aria-label={`${props.component.componentName} cases`}
      data-gtsx-case-sidebar={props.component.coordinate}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        background: "transparent",
        border: 0,
        boxShadow: "none",
        display: "grid",
        gap: 14,
        maxHeight: "calc(100% - 96px)",
        overflow: "auto",
        padding: 0,
        position: "absolute",
        right: 12,
        top: 72,
        width: 200,
        zIndex: 4,
      }}
    >
      {props.component.cases.map((testCase) => (
        <CasePreviewCard
          component={props.component}
          frameState={mergeStudioPreviewFrameState(
            previewSessionId(props.component, testCase.name),
            undefined,
            props.previewCache?.[studioPreviewCacheKey(props.component, testCase.name, props.viewportPreset)]?.frameState,
          )}
          key={testCase.name}
          manifest={props.manifest}
          onChangeCase={props.onChangeCase}
          selected={props.selectedCaseName === testCase.name}
          testCaseName={testCase.name}
        />
      ))}
    </aside>
  )
}

SelectedComponentCasesSidebar.cases = {
  readySelected: {
    props: {
      component: {
        coordinate: "src/UserCard.g.tsx#default",
        filePath: "src/UserCard.g.tsx",
        exportName: "default",
        componentName: "UserCard",
        mode: "scope",
        cases: [
          { kind: "scope", name: "loading" },
          { kind: "scope", name: "ready" },
        ],
        providers: {},
        diagnostics: [],
      },
      manifest: {
        version: 1,
        routes: {
          preview: "/gtsx",
          studio: "/gtsx/studio",
          manifest: "/gtsx/studio/manifest",
        },
        preview: {
          urlTemplate: "/gtsx?entry={entry}&case={case}{gcase}",
          allUrlTemplate: "/gtsx?entry={entry}{gcase}",
        },
        files: [],
        diagnostics: [],
      },
      previewCache: {},
      selectedCaseName: "ready",
      viewportPreset: "tablet",
    },
  },
} satisfies GCases<SelectedComponentCasesSidebarProps>
