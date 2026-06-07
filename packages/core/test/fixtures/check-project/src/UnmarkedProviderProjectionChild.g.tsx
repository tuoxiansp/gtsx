import type { GFrames } from "@runelight/core"

type Props = {
  userName: string
}

export default function UnmarkedProviderProjectionChild(props: Props) {
  return <span>{props.userName}</span>
}

UnmarkedProviderProjectionChild.frames = {
  guest: {
    props: { userName: "Guest" },
  },
  named: {
    props: { userName: "Ada" },
  },
} satisfies GFrames<Props>
