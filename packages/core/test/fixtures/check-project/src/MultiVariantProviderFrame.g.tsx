import { useGContext, type GFrames, type GProviderFrame } from "@runelight/react/runtime"

import { LoginProvider } from "./MissingProviderVariant.g"

export default function MultiVariantProviderFrame() {
  const login = useGContext(LoginProvider)
  return <span>{login.kind === "login" ? login.name : "Guest"}</span>
}

MultiVariantProviderFrame.frames = {
  loading: {
    description: "loading frame",
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "login" | "anonymous">,
} satisfies GFrames<Record<string, never>, never, [typeof LoginProvider]>
