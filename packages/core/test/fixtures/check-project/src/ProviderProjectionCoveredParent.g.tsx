import {
  useGContext,
  type GFrames,
  type GProviderFrame,
} from "@runelight/core"

import ProviderVariantProjection from "./ProviderVariantProjection.g"
import { LoginProvider } from "./MissingProviderVariant.g"

export default function ProviderProjectionCoveredParent() {
  const login = useGContext(LoginProvider)
  return <ProviderVariantProjection userName={login.kind === "login" ? login.name : "Guest"} />
}

ProviderProjectionCoveredParent.frames = {
  login: {
    props: {},
    providers: [[LoginProvider, { kind: "login", name: "Ada" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
  anonymous: {
    props: {},
    providers: [[LoginProvider, { kind: "anonymous" }]],
  } satisfies GProviderFrame<typeof LoginProvider, "anonymous">,
} satisfies GFrames<Record<string, never>, never, [typeof LoginProvider]>
