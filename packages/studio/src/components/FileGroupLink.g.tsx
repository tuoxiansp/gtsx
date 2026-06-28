import type { GFrames } from "@runelight/react/runtime"

import { studioPreviewCacheKey, type StudioPreviewCacheEntry } from "../client"
import type { StudioManifest, StudioManifestFile } from "../manifest"
import { studioColors, studioFontFamily, studioRadii } from "../studio-theme"
import SidebarComponentPreview from "./SidebarComponentPreview.g"

type FileGroupLinkProps = {
  file: StudioManifestFile
  manifest: StudioManifest
  onChangeSelection?: (selection: string) => void
  previewCache?: Record<string, StudioPreviewCacheEntry>
  selectedId: string
}

export default function FileGroupLink(props: FileGroupLinkProps) {
  const fileSelection = `file:${props.file.path}`
  const fileName = props.file.path.split("/").pop() ?? props.file.path
  const directoryName = props.file.path.includes("/") ? props.file.path.slice(0, props.file.path.lastIndexOf("/")) : ""

  return (
    <section style={{ display: "grid", gap: 8 }}>
      <a
        href={`?selection=${encodeURIComponent(fileSelection)}`}
        onClick={(event) => {
          if (!props.onChangeSelection) return
          event.preventDefault()
          props.onChangeSelection(fileSelection)
        }}
        style={{
          color: props.selectedId === fileSelection ? studioColors.accent : studioColors.textMuted,
          display: "grid",
          fontFamily: studioFontFamily,
          gap: 2,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.35,
          overflowWrap: "anywhere",
          textDecoration: "none",
        }}
      >
        <span>{fileName}</span>
        {directoryName ? (
          <span style={{ color: studioColors.textDim, fontFamily: studioFontFamily, fontSize: 10, fontWeight: 500 }}>
            {directoryName}
          </span>
        ) : null}
      </a>
      <div style={{ display: "grid", gap: 7 }}>
        {props.file.components.map((component) => {
          const componentSelection = `component:${component.coordinate}`
          const isSelected = props.selectedId === componentSelection
          return (
            <a
              href={`?selection=${encodeURIComponent(componentSelection)}`}
              key={component.coordinate}
              onClick={(event) => {
                if (!props.onChangeSelection) return
                event.preventDefault()
                props.onChangeSelection(componentSelection)
              }}
              style={{
                background: isSelected ? studioColors.panelBgElevated : studioColors.panelBg,
                border: "1px solid",
                borderColor: isSelected ? studioColors.accentBorder : studioColors.panelBorder,
                borderRadius: studioRadii.md,
                boxShadow: isSelected ? `0 0 0 1px ${studioColors.accentMuted}` : undefined,
                color: studioColors.text,
                display: "block",
                fontFamily: studioFontFamily,
                overflow: "hidden",
                padding: 8,
                textDecoration: "none",
              }}
              title={component.componentName}
            >
              <SidebarComponentPreview
                component={component}
                frameState={
                  component.frames[0]?.name
                    ? props.previewCache?.[studioPreviewCacheKey(component, component.frames[0].name, "tablet")]?.frameState
                    : undefined
                }
                manifest={props.manifest}
              />
            </a>
          )
        })}
      </div>
    </section>
  )
}

FileGroupLink.frames = {
  selectedComponent: {
    description: "selectedComponent frame",
    props: {
      file: {
        path: "src/UserCard.g.tsx",
        sourceHash: "user-card-source",
        components: [
          {
            coordinate: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            sourceHash: "user-card-source",
            exportName: "default",
            componentName: "UserCard",
            mode: "scope",
            frames: [{ kind: "scope", name: "ready" }],
            providers: {},
            diagnostics: [],
          },
        ],
        diagnostics: [],
      },
      manifest: {
        version: 1,
        routes: {
          preview: "/runelight",
          studio: "/runelight/studio",
          manifest: "/runelight/studio/manifest",
        },
        files: [],
        diagnostics: [],
      },
      previewCache: {},
      selectedId: "component:src/UserCard.g.tsx#default",
    },
  },
} satisfies GFrames<FileGroupLinkProps>
