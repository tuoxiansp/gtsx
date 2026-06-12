import { useGContext, type GFrames, type GProviderFrame } from "@runelight/react/runtime"

import UnmarkedProviderProjectionChild from "./UnmarkedProviderProjectionChild.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionParent() {
  const login = useGContext(LoginProvider)
  return <UnmarkedProviderProjectionChild userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionParent.frames = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
  anonymous: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "anonymous">,
} satisfies GFrames<Record<string, never>, never, [typeof LoginProvider]>
