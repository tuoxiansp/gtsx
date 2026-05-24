import type { GCases } from "gtsx"

import { StudioEmptyState, type StudioEmptyStateProps } from "./StudioEmptyState"

export default function StudioEmptyStateExample(props: StudioEmptyStateProps) {
  return <StudioEmptyState {...props} />
}

StudioEmptyStateExample.cases = {
  empty: {
    props: {
      title: "No components selected",
      detail: "Studio can inspect this package the same way it inspects any other GTSX project.",
      actionLabel: "Create a case",
    },
  },
} satisfies GCases<StudioEmptyStateProps>
