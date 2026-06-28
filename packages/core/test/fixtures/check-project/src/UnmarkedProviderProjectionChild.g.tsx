import type { GFrames } from "@runelight/react/runtime"

type Props = {
  userName: string
}

export default function UnmarkedProviderProjectionChild(props: Props) {
  return <span>{props.userName}</span>
}

UnmarkedProviderProjectionChild.frames = {
  guest: {
    description: "guest frame",
    props: { userName: "Guest" },
  },
  named: {
    description: "named frame",
    props: { userName: "Ada" },
  },
} satisfies GFrames<Props>
