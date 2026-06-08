import type { GFrames } from "@runelight/core"

export default function FrameworkBridge() {
  return (
    <section className="design-frame design-framework-bridge">
      <div>
        <p className="site-eyebrow">React and Vue</p>
        <h2>One protocol, framework-native authoring.</h2>
        <p>Runelight keeps the Studio model consistent while each host writes frames in its own component language.</p>
      </div>

      <div className="design-framework-columns">
        <article>
          <span>React</span>
          <strong>.g.tsx</strong>
          <p>GFrames, providers, and scope hooks live beside JSX branches.</p>
        </article>
        <article>
          <span>Vue</span>
          <strong>.g.vue</strong>
          <p>Design and component states stay template-first with the same Studio manifest.</p>
        </article>
      </div>
    </section>
  )
}

FrameworkBridge.frames = {
  live: { props: {} },
} satisfies GFrames<Record<string, never>>
