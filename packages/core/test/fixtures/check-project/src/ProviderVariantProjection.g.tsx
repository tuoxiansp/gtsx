import {
  type GFrames,
  type GProviderFrame,
} from "@runelight/core"

import { LoginProvider } from "./MissingProviderVariant.g"

type Props = {
  userName: string
}

export default function ProviderVariantProjection(props: Props) {
  return <span>{props.userName}</span>
}

ProviderVariantProjection.frames = {
  loginName: {
    props: { userName: "Ada" },
  } satisfies GProviderFrame<typeof LoginProvider, "login">,
  anonymousName: {
    props: { userName: "Guest" },
  } satisfies GProviderFrame<typeof LoginProvider, "anonymous">,
} satisfies GFrames<Props>
