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
      data-gtsx-canvas-wheel-exempt="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        alignContent: "start",
        background: "transparent",
        border: 0,
        bottom: 0,
        boxSizing: "border-box",
        boxShadow: "none",
        display: "grid",
        gap: 14,
        height: "100%",
        overscrollBehavior: "contain",
        overflow: "auto",
        padding: 12,
        position: "absolute",
        right: 0,
        top: 0,
        width: 224,
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
