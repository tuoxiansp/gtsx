import type { GCases } from "gtsx"

import type { StudioManifest, StudioManifestFile } from "../manifest"
import SidebarComponentPreview from "./SidebarComponentPreview.g"

type FileGroupLinkProps = {
  file: StudioManifestFile
  manifest: StudioManifest
  onChangeSelection?: (selection: string) => void
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
          color: props.selectedId === fileSelection ? "#0969da" : "#57606a",
          display: "grid",
          gap: 2,
          fontSize: 12,
          fontWeight: 750,
          lineHeight: 1.35,
          overflowWrap: "anywhere",
          textDecoration: "none",
        }}
      >
        <span>{fileName}</span>
        {directoryName ? (
          <span style={{ color: "#8b949e", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 10, fontWeight: 500 }}>
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
                background: isSelected ? "#eaf4ff" : "#ffffff",
                border: "1px solid",
                borderColor: isSelected ? "#8ec5ff" : "#d8dee8",
                borderRadius: 12,
                boxShadow: isSelected ? "0 6px 18px rgba(9,105,218,0.12)" : "0 1px 2px rgba(31,35,40,0.04)",
                color: "#1f2328",
                display: "block",
                overflow: "hidden",
                padding: 8,
                textDecoration: "none",
              }}
              title={component.componentName}
            >
              <SidebarComponentPreview component={component} manifest={props.manifest} />
            </a>
          )
        })}
      </div>
    </section>
  )
}

FileGroupLink.cases = {
  selectedComponent: {
    props: {
      file: {
        path: "src/UserCard.g.tsx",
        groupId: "file:src/UserCard.g.tsx",
        components: [
          {
            coordinate: "src/UserCard.g.tsx#default",
            filePath: "src/UserCard.g.tsx",
            exportName: "default",
            componentName: "UserCard",
            mode: "scope",
            cases: [{ kind: "scope", name: "ready" }],
            providers: {},
            diagnostics: [],
          },
        ],
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
      selectedId: "component:src/UserCard.g.tsx#default",
    },
  },
} satisfies GCases<FileGroupLinkProps>
