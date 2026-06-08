import type { GFrames } from "@runelight/core"

type HeroSystemMapProps = {
  studioImage: string
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
    providers: [[SessionProvider, {
      variant: "anonymous"
    }]],
  },
  signedIn: {
    providers: [[SessionProvider, {
      variant: "signed-in",
      user: { name: "Ada Lovelace" }
    }]],
  },
} satisfies GFrames<AuthCaseProps>`}</pre>
      </article>

      <article className="hero-scene-panel hero-scene-studio">
        <header>
          <span>Runelight Studio</span>
          <strong>visual branch map</strong>
        </header>
        <img src={props.studioImage} alt="Runelight Studio canvas showing component frame cards" />
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
        <span>studio</span>
        <i />
        <span>capture</span>
      </div>
    </section>
  )
}

HeroSystemMap.frames = {
  live: {
    props: {
      studioImage: "/captures/studio-components.png",
      authImage: "/captures/cases/auth-case.png",
      dataImage: "/captures/cases/data-case.png",
      layoutImage: "/captures/cases/layout-case.png",
    },
  },
} satisfies GFrames<HeroSystemMapProps>
