import type { GFrames, GProviderFrame } from "@runelight/react/runtime"

import { LoginProvider } from "./MissingProviderVariant.g"

type Props = {
  userName: string
}

export default function ProviderVariantProjection(props: Props) {
  return <span>{props.userName}</span>
}

ProviderVariantProjection.frames = {
  loginName: {
    description: "loginName frame",
    props: { userName: "Ada" },
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
  anonymousName: {
    description: "anonymousName frame",
    props: { userName: "Guest" },
  } satisfies GProviderFrame<typeof LoginProvider, "anonymous">,
} satisfies GFrames<Props>
