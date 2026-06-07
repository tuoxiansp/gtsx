## 0. Brief Inference

Before touching a design frame, infer what the user actually wants. Weak AI design usually starts from a default aesthetic instead of reading the room.

### 0.A Read These Signals First

1. **Surface kind** - product screen, dashboard, settings panel, checkout, onboarding, landing page, portfolio, editorial page, redesign, or visual system exploration.
2. **Vibe words** - minimalist, calm, premium, playful, serious B2B, editorial, trust-first, dense, operational, cinematic, experimental.
3. **Reference signals** - screenshots, existing app routes, product names, competitor brands, UI kit references, and language already used in the codebase.
4. **Audience** - buyer, operator, admin, developer, consumer, recruiter, public-sector user, accessibility-first user, or internal teammate.
5. **Existing visual material** - logo, tokens, typography, imagery, icon style, radius scale, layout density, and copy tone.
6. **Quiet constraints** - regulated domains, trust-first commerce, kids' products, healthcare, finance, accessibility, and localization.

### 0.B State A Design Read

Before drafting, state one concise design read:

> Reading this as: `<surface kind>` for `<audience>`, with a `<vibe>` language, leaning toward `<visual family>`.

Examples:

- "Reading this as: operational dashboard for support leads, with a dense trust-first language, leaning toward compact tables and restrained color."
- "Reading this as: mobile onboarding for design-conscious consumers, with a calm premium language, leaning toward soft hierarchy and tactile transitions."
- "Reading this as: public-sector redesign, with an accessibility-first language, leaning toward plain structure, direct copy, and strong contrast."

### 0.C Ask Only When Direction Diverges

Ask one clarifying question only when the missing answer changes the product direction. If you can infer a useful first pass, declare the assumption and proceed.

### 0.D Anti-Default Discipline

Do not default to AI-purple gradients, centered hero over a dark mesh, three equal feature cards, generic glassmorphism, endless decorative animation, or Inter plus slate as the whole identity. Pick the visual language from the brief.

---

## 1. The Three Dials

Set three dials after the design read. They guide layout, motion, and density.

- **DESIGN_VARIANCE: 1-10** - 1 = perfect symmetry, 10 = artsy chaos.
- **MOTION_INTENSITY: 1-10** - 1 = static, 10 = cinematic.
- **VISUAL_DENSITY: 1-10** - 1 = gallery-airy, 10 = cockpit-packed.

Default baseline: **6 / 4 / 4**. Raise or lower based on the product context.

### Dial Inference

| Signal | Variance | Motion | Density |
|---|---:|---:|---:|
| Minimalist / clean / calm | 4-6 | 2-4 | 2-4 |
| Premium consumer / luxury | 6-8 | 4-7 | 2-4 |
| Playful / experimental | 8-10 | 6-9 | 2-5 |
| Landing page / portfolio | 6-9 | 4-8 | 2-5 |
| Trust-first / regulated | 2-4 | 1-3 | 4-6 |
| Admin / operations | 3-6 | 1-3 | 6-9 |
| Redesign preserve | match existing | match existing | match existing |
| Redesign overhaul | existing + 1-2 | existing + 1-2 | match existing |

---

## 2. Visual Direction Map

Choose a visual foundation before composing. This is about taste and product fit, not package choice.

| Brief reads as... | Visual foundation |
|---|---|
| Enterprise SaaS / admin | Dense grids, plain hierarchy, restrained accent, clear row states, conservative motion. |
| Developer tool | Crisp typography, mono accents only where useful, sharp information grouping, low decoration. |
| Consumer app | Stronger flow, tactile affordances, warmer copy, touch-friendly spacing, clearer empty states. |
| Premium consumer | Controlled palette, confident type scale, deliberate imagery, few but high-impact surfaces. |
| Public-sector / regulated | Direct copy, high contrast, familiar patterns, low motion, visible validation and errors. |
| Editorial / publication | Type-led hierarchy, asymmetric rhythm, generous reading line-height, restrained surfaces. |
| Agency / creative | Higher layout variance, kinetic composition, bolder crops, distinctive type. |
| Commerce | Product-first imagery, scannable options, clear price/value hierarchy, trustworthy checkout cues. |

If an existing design system is present, its tokens, spacing, typography, icon style, and component behavior are the starting point. Depart only when the user explicitly asks for exploration or overhaul.

---

## 3. Typography

Typography carries most of the perceived quality. Choose type for the audience and product surface.

- Display type should communicate the brand posture: neutral, editorial, technical, playful, luxury, or institutional.
- Body copy should be legible before it is stylish. Keep line lengths comfortable and line-height generous enough for the script.
- Avoid defaulting to the same neutral sans for every project. A product can be restrained without being anonymous.
- Serif is not a shortcut to premium. Use it only for genuinely editorial, luxury, heritage, manuscript, or publication contexts.
- For emphasis inside a headline, prefer weight, italic, scale, or color within the same family. Random mixed-family emphasis often looks amateur.
- Avoid oversized headlines that only scream. Control hierarchy with weight, proportion, spacing, and contrast.
- Audit descenders in italic display type. Do not clip letters such as `y`, `g`, `j`, `p`, and `q`.
- In CJK or multilingual UI, give dense scripts enough line-height and avoid Latin-only font assumptions.

---

## 4. Color

Color should feel inevitable for the brand and domain.

- Use one dominant accent unless the product has a real multi-category color system.
- Avoid automatic purple/blue glows, neon gradients, and oversaturated accents.
- Keep warm and cool neutrals consistent. Do not mix unrelated gray families across the same surface.
- Once an accent is chosen, use it consistently across the whole frame.
- Trust-first and operational surfaces usually need calmer color and clearer contrast, not richer decoration.
- Premium-consumer briefs should not default to beige, brass, clay, oxblood, and espresso every time. Rotate into colder luxury, forest, monochrome with a saturated pop, cobalt, olive, slate, or other brand-specific families.
- Never fake data meaning with arbitrary badge colors. A color used for status must carry a stable meaning.
- Check button, form, and body text contrast against their backgrounds.

---

## 5. Layout And Composition

Start from the user's task: decide, compare, read, enter, monitor, or act.

- Content-first layout beats decoration-first layout.
- Make one clear primary action per frame unless the design is intentionally decision-heavy.
- Use whitespace, alignment, rhythm, and type scale before adding boxes.
- Centered hero/header compositions are not the default when the design needs personality. Try split, offset, asymmetric, vertical-stack, or media-led compositions.
- Admin tools should be dense and scannable. Consumer/mobile surfaces should emphasize flow and touch ergonomics. Marketing pages need a stronger first-viewport story.
- Avoid repeated section families. A page with many sections should not reuse the same "headline plus three cards" pattern again and again.
- Do not use card-inside-card or panel-inside-panel unless the domain truly needs nested objects.
- Use the lightest sufficient boundary: spacing, alignment, divider, row hover, subtle surface, border, then elevation.
- Empty boxes do not make sparse content designed. Solve sparseness with better hierarchy, imagery, or clearer content.

### Hero And First View

- The first view must communicate purpose quickly.
- Headlines should not become four-line walls unless the editorial concept requires it.
- Supporting copy should be short enough to scan.
- CTAs should be visible without hunting.
- Logo walls, trust strips, pricing teasers, and feature bullets belong below the main value moment, not crammed into it.

### Navigation

- Navigation should be readable in one pass.
- Desktop nav should not wrap.
- Keep nav height modest unless the product deliberately uses a large editorial masthead.
- Condense, group, or move secondary items rather than forcing everything into the top row.

---

## 6. Materiality, Boundaries, And Surfaces

Every surface needs a reason.

Add a framed surface only when at least one is true:

- The user scans or compares many similar items.
- The region is selectable, editable, expandable, draggable, focusable, or stateful.
- The content is an object: ticket, message, receipt, media item, SKU, note, file, or document.
- The domain is a dense dashboard, form, settings page, commerce grid, or admin workflow.
- The visual system already uses that surface pattern.

Use elevation only for hierarchy, state, or material layering. When shadow is used, tint it to the background hue; pure black drop shadows often look cheap.

Pick a radius system and stick to it. Mixed radius styles are acceptable only with a clear rule, such as pill buttons plus 12px cards plus 8px inputs.

---

## 7. Interaction And States

Even design drafts should imply how the UI behaves.

- Loading states should match the final layout shape. Avoid generic spinners by default.
- Empty states should show how to get started without adding filler.
- Error states should be contextual and legible.
- Disabled states should explain constraints when the reason is not obvious.
- Hover, focus, pressed, selected, and expanded states should feel tactile and coherent.
- Do not show only the perfect success state when risk or edge states define user trust.
- Use progressive disclosure when secondary details are not needed for the immediate decision.

For Runelight design exploration, do not turn every interaction into code. If a visual state matters, create a separate design frame or make the chosen state explicit in the draft.

---

## 8. Motion

Motion must communicate something.

Valid reasons:

- Hierarchy: draw attention to the right thing.
- Storytelling: reveal content in a sequence that matches the narrative.
- Feedback: acknowledge an action.
- State transition: show what changed.

Invalid reason: "it looks cool."

Rules:

- Low-motion domains include regulated, public-sector, operational dashboards, and accessibility-critical surfaces.
- Higher-motion domains include premium consumer, playful, agency, onboarding, and storytelling.
- Avoid infinite loops unless the section actively benefits from liveliness.
- One marquee-like device per page is plenty.
- Motion should respect reduced-motion preferences in the eventual implementation.
- If motion cannot be verified, prefer a clean static composition over half-built animation.

---

## 9. Imagery And Visual Assets

Visual products need visual material.

- Product, place, person, gameplay, object, or workflow pages should reveal the real thing as early as possible.
- Avoid fake screenshots made of random rectangles.
- Use real screenshots, generated imagery, product photography, editorial photos, or clearly labeled image slots.
- Even restrained pages often need at least one meaningful visual anchor.
- Logo walls should use actual marks or intentionally designed simple marks; plain text names in a row look unfinished.
- Do not invent fake-precise metrics or fake customer logos as credibility theater.
- If no real visual assets exist, state the needed placements instead of filling the frame with decorative filler.

---

## 10. Content Density And Copy

Design starts by deleting.

- Use the fewest visible facts that communicate the product moment.
- Add metadata only when it changes what the user understands, decides, or does.
- Long lists need a better pattern, not a longer list.
- Group specifications into meaningful clusters rather than drawing a divider under every row.
- Avoid vague verbs such as "elevate", "unleash", "revolutionize", and "seamless" unless the brand truly speaks that way.
- Avoid cute-but-wrong copy, forced metaphors, fake humility, and AI-poetic phrasing.
- Use one copy register per frame.
- Button labels should be short and consistent by intent.
- Do not duplicate CTA intent with five different labels.

---

## 11. Forms And Inputs

Forms fail quietly when visual hierarchy is weak.

- Labels belong above inputs, not only as placeholders.
- Helper text should be optional but available when it clarifies.
- Error text belongs near the field it explains.
- Placeholder text, labels, helper text, focus rings, and errors must have enough contrast.
- Hit targets should be comfortable for the intended device.
- Form groups should use consistent spacing.
- The primary action should be reachable after the user completes the form.

---

## 12. Theme And Dark Mode

The frame should feel like one product.

- Choose light, dark, or system-aware direction intentionally.
- Avoid random theme inversion section by section.
- Background tints within a theme family are fine; flipping between unrelated themes is usually broken.
- Maintain hierarchy and contrast in both light and dark versions when both are relevant.
- No pure black or pure white by default; off-black and off-white usually give more depth.

---

## 13. AI Tells To Avoid

### Visual

- Neon outer glows by default.
- Purple/blue gradient as a substitute for brand.
- Decorative blobs with no purpose.
- Glassmorphism everywhere.
- Pure black plus oversaturated accent.
- Excessive gradient text.
- Custom mouse cursors.

### Typography

- Same default type choice for every brief.
- Oversized hero text with weak copy.
- Random serif insertion for "premium" flavor.
- Tight line-height that clips display type.

### Layout

- Three equal feature cards as the default answer.
- Repeated zigzag image/text sections.
- Split header pattern repeated section after section.
- Card stacks where spacing and alignment would be enough.
- Bento grids with empty cells or no visual variety.
- Desktop navigation wrapping to two lines.

### Content

- "John Doe", "Acme", "Nexus", "SmartFlow", and other generic placeholders.
- Fake-perfect metrics such as 99.99%, 50%, or 1234567.
- Decorative badges, icons, or stats that do not help the user decide.
- Placeholder testimonials that read like generated praise.

---

## 14. Pattern Vocabulary

Know these names so you can choose intentionally:

- **Hero paradigms**: split hero, editorial hero, product-first hero, manifesto hero, media-led hero.
- **Navigation**: masthead, utility nav, command nav, tabs, segmented control, sidebar rail.
- **Layouts**: asymmetric grid, bento grid, masonry, card rail, master-detail, dashboard cockpit, list-detail, stepped flow.
- **Surfaces**: card, panel, row, tile, sheet, modal, popover, drawer, toast, table row.
- **Motion**: reveal, stagger, parallax, scrub, pinned section, shared transition, tactile press.
- **Media**: full-bleed image, product cutout, contact sheet, gallery rail, viewport mock, real screenshot.
- **Text**: eyebrow, deck, headline, dek, caption, metadata, pull quote, proof point.

---

## 15. Redesign Protocol

For redesigns, decide whether the ask is preservation, targeted evolution, or full overhaul.

### Audit Before Touching

Inspect:

- Current layout structure.
- Typography scale and tone.
- Palette and semantic colors.
- Radius and shadow system.
- Imagery and icon language.
- Copy register.
- Existing states and interaction affordances.

### Preserve Unless Asked

Do not silently change:

- Brand colors.
- Logo and mark treatment.
- Navigation architecture.
- Primary conversion path.
- Legal, trust, or compliance content.
- Domain terminology.

### Modernization Levers

Use these in order:

1. Tighten hierarchy.
2. Improve spacing rhythm.
3. Improve type scale.
4. Improve contrast.
5. Remove weak decoration.
6. Clarify actions and states.
7. Introduce stronger imagery.
8. Shift palette only when the brief allows it.

---

## 16. Final Pre-Flight Check

Before hand-off, check:

- Did the design read match the actual surface and audience?
- Are the three dials reflected in the frame?
- Can the user understand the frame within two seconds?
- Is the primary action obvious?
- Does the information hierarchy follow the user's decision order?
- Are colors, type, spacing, radius, shadows, and icons coherent?
- Is there enough contrast?
- Does text fit without awkward wrapping or overlap?
- Are realistic names, labels, values, and states used?
- Are any visual elements merely filler?
- Does the design respect existing product conventions where available?
- Does it still look intentional when real data replaces sample data?
