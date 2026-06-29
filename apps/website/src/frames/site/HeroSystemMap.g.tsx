import type { GFrames } from "@runelight/react/runtime"

type HeroSystemMapProps = {
  previewImage: string
  authImage: string
  dataImage: string
  layoutImage: string
}

export default function HeroSystemMap(props: HeroSystemMapProps) {
  return (
    <section className="hero-system-map">
      <div className="hero-scene-sheen" />
      <div className="hero-scene-rail hero-scene-rail-a" />
      <div className="hero-scene-rail hero-scene-rail-b" />

      <article className="hero-scene-code">
        <header>
          <span>AuthCase.g.tsx</span>
          <strong>frames</strong>
        </header>
        <pre>{`AuthCase.frames = {
  anonymous: {
    description: "anonymous frame",
    providers: [[SessionProvider, {
      variant: "anonymous"
    }]],
  },
  signedIn: {
    description: "signedIn frame",
    providers: [[SessionProvider, {
      variant: "signed-in",
      user: { name: "Ada Lovelace" }
    }]],
  },
} satisfies GFrames<AuthCaseProps>`}</pre>
      </article>

      <article className="hero-scene-panel hero-scene-preview">
        <header>
          <span>preview target</span>
          <strong>visual branch path</strong>
        </header>
        <img src={props.previewImage} alt="Runelight preview capture showing a covered component frame" />
      </article>

      <article className="hero-scene-panel hero-scene-auth">
        <header>
          <span>auth branches</span>
          <strong>2 frames</strong>
        </header>
        <img src={props.authImage} alt="Runelight contact sheet showing AuthCase frames" />
      </article>

      <article className="hero-scene-panel hero-scene-data">
        <header>
          <span>data states</span>
          <strong>3 frames</strong>
        </header>
        <img src={props.dataImage} alt="Runelight contact sheet showing data state frames" />
      </article>

      <article className="hero-scene-panel hero-scene-layout">
        <header>
          <span>layout pressure</span>
          <strong>3 frames</strong>
        </header>
        <img src={props.layoutImage} alt="Runelight contact sheet showing layout frames" />
      </article>

      <div className="hero-scene-chain" aria-hidden="true">
        <span>source</span>
        <i />
        <span>preview</span>
        <i />
        <span>capture</span>
      </div>
    </section>
  )
}

HeroSystemMap.frames = {
  live: {
    description: "Hero system map with preview and case-study captures",
    props: {
      previewImage: "/captures/site/website-hero-preview.png",
      authImage: "/captures/cases/auth-case.png",
      dataImage: "/captures/cases/data-case.png",
      layoutImage: "/captures/cases/layout-case.png",
    },
  },
} satisfies GFrames<HeroSystemMapProps>
