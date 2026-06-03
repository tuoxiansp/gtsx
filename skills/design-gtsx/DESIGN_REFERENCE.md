# Design Reference

This document defines design standards for gtsx design frames. It is intended for agents and contributors creating or revising React/TSX web surfaces in `project.root/gtsx/design/*.g.tsx`, including product GUI, marketing pages, content pages, and interactive prototypes.

## Scope

Applies to:

- Product GUI: mobile app screens, desktop app surfaces, web app UI, panels, feeds, chats, editors, forms, settings, queues, dashboards, and workflows.
- Public web surfaces: marketing pages, launch pages, portfolio pages, content pages, docs-adjacent pages, and brand/product storytelling pages.
- Visual direction, information hierarchy, density tuning, interaction states, component-level product design, and page-level composition.

Use another reference or add surface-specific rules when the requested surface is outside normal web UI, such as:

- Native mobile UI not expressed as React/TSX web UI.
- Game rendering, 3D scenes, or canvas-heavy interactive systems where game/graphics rules dominate.
- Deep brand identity systems, illustration systems, or generated image boards where the deliverable is not a TSX frame.

## Design Method

Use this method before writing TSX:

- Read the product context before styling.
- Convert vague prompts into an explicit design read.
- Choose a concrete visual anchor and aesthetic family.
- Tune concrete design dials before drawing.
- Apply the relevant surface preset and component rules.
- Use the pre-flight check before delivery.

Select assumptions by surface type:

- App GUI usually needs a task title, object context, active workspace, and stateful controls.
- Marketing and content pages usually need first-viewport storytelling, page rhythm, media strategy, conversion paths, and section-to-section composition.
- Use logo walls, testimonials, social proof, press quotes, hero sections, and conversion funnels only when they are appropriate to the requested web surface.
- Use images when they carry product content, brand story, media, previews, maps, thumbnails, generated assets, or page storytelling. Do not add stock decoration that weakens clarity.
- Avoid scrolltelling, pinned narratives, cinematic transitions, and decorative marquees in operational UI. They may be appropriate for public storytelling pages when they serve the content.
- Avoid broad "premium" styling that harms scan speed, information density, accessibility, conversion clarity, or native platform expectations.

## Design Read

Before implementing a frame, infer and briefly state:

```txt
Reading this as: <surface kind> for <user/audience>, in <usage mode>, with <density>, <tone>, and <platform constraints>.
```

Read these signals first:

- **Surface kind**: landing page, marketing page, portfolio, docs page, content page, chat, feed, queue, detail page, dashboard, editor, settings, creation flow, checkout, onboarding, modal, empty state.
- **Primary job**: persuade, explain, convert, navigate, decide, compare, enter, review, publish, reply, triage, monitor, configure, consume, recover.
- **User mode**: exploratory, promotional, editorial, casual, focused, operational, social, transactional, creative, high-trust, high-risk.
- **Platform**: responsive web, mobile touch, desktop pointer, tablet, embedded panel, full-screen workspace.
- **Existing system**: tokens, components, icon family, radius, spacing, copy voice, app shell, brand assets, route conventions.
- **Data/content shape**: content sections, media, pricing, testimonials, records, messages, metrics, forms, filters, statuses, permissions, destructive actions.
- **Risk**: money, privacy, moderation, safety, account settings, irreversible work, compliance, brand trust, conversion ambiguity.

Ask one question only when the missing answer changes the product direction. Otherwise make a visible assumption and proceed.

## Visual Direction

Before layout, define the visible design direction. A design direction is not a mood word. It must name what the user will actually see.

Required direction fields:

- **Visual anchor**: the concrete thing that carries the composition, such as a product object, real content item, screenshot-like component, media thumbnail, map, avatar cluster, document, chart, message thread, pricing object, or workspace canvas.
- **Aesthetic family**: one of the families below, or a project-specific family inferred from existing design.
- **Type strategy**: compact system UI, editorial display, technical mono pairing, friendly rounded sans, or brand type.
- **Color/material strategy**: neutral utility, high-contrast editorial, tinted surfaces, tactile consumer color, technical dark, paper/content, or brand-led palette.
- **One memorable move**: one useful visual decision that a reviewer can point to, such as an oversized real object preview, a strong split, a pinned action rail, an expressive media crop, a shaped feed rhythm, a calm document canvas, or a dense but readable comparison block.

If these fields cannot be named, the frame is not ready to implement.

### Aesthetic Families

Choose one family as the primary direction. Mix only when the existing product system already mixes them with a clear rule.

#### Native Product Polish

Use for settings, account, forms, standard SaaS, mobile utilities, and mature app surfaces.

- Visual moves: crisp top bars, clear grouping, restrained surfaces, high-quality empty/loading/error states, strong focus rings, consistent controls.
- Type: system UI or existing app font, medium weight contrast, tabular numbers when needed.
- Color/material: neutral surfaces, one brand accent, semantic state colors.
- Avoid: dramatic hero type, abstract gradients, cinematic layout, decorative glass.

#### Editorial Product Web

Use for product pages, portfolios, docs-adjacent pages, launch pages, and content-heavy surfaces.

- Visual moves: strong typographic hierarchy, deliberate margins, media-led sections, asymmetric but readable grids, confident captions.
- Type: display sans or tasteful brand type with readable body text.
- Color/material: high-contrast neutral base, one accent, paper/content surfaces, restrained image treatments.
- Avoid: random decorative metadata, fake issue labels, tiny uppercase labels on every section.

#### Technical Instrument

Use for developer tools, analytics, monitoring, operations, finance, admin, and command surfaces.

- Visual moves: dense information zones, aligned metrics, clear status hierarchy, keyboard/command affordances, real table/chart structure.
- Type: system sans plus mono for numbers/code, tabular figures.
- Color/material: dark or light neutral system, semantic states, sparse separators.
- Avoid: fake precision, ornamental data cards, glowing status dots, huge whitespace that slows scanning.

#### Social Warmth

Use for chat, creator tools, community, feeds, gifting, lightweight collaboration, and casual mobile screens.

- Visual moves: readable conversations, tactile composer, avatars/media, compact emotional objects, soft but clear status.
- Type: friendly sans or native system UI, generous line height for message text.
- Color/material: soft surfaces, one warm or brand accent, restrained semantic colors.
- Avoid: over-cute copy in transactional moments, random per-item colors, weak contrast, cramped touch targets.

#### Consumer Tactile

Use for commerce, lifestyle products, booking, checkout previews, wellness, food, travel, and product storytelling.

- Visual moves: real product/media anchor, tactile cards, purchase/booking object clarity, price/state/action grouping.
- Type: brand-led sans or display face, readable body and pricing.
- Color/material: brand palette, tactile surfaces, product-relevant imagery.
- Avoid: generic beige luxury, stock decoration, fake trust claims, hidden purchase actions.

#### Brand Launch / Campaign

Use for public marketing pages, launches, campaign pages, and high-concept product storytelling.

- Visual moves: first-viewport object signal, bold media composition, clear CTA path, varied section rhythm, memorable brand moment.
- Type: display system matched to brand, short copy, strong contrast.
- Color/material: brand-led palette and media strategy.
- Avoid: abstract blobs as the main visual, centered hero by default, three equal feature cards, vague value props.

## Composition Patterns

Use these patterns as starting points. They are concrete layout recipes, not visual requirements.

### Product GUI

- **Object-first detail**: top context bar, large primary object/content area, side metadata/actions, sticky primary action near the decision point.
- **Triage queue**: compact list with status/action columns, batch toolbar, filters close to the list, one highlighted urgent item.
- **Workspace shell**: global navigation, local toolbar, large canvas/content area, inspector rail, command/action surface.
- **Chat/composer**: sticky context header, message stream with event objects, stable bottom composer, clear send/attachment/gift states.
- **Feed with rhythm**: filter row, one featured or pinned item, repeated items with varied weight only when status/content differs.
- **Comparison block**: aligned values, meaningful grouping, sparse dividers, explicit selected/recommended state.

### Public Web

- **Object-led hero**: first viewport shows the product, place, person, or content object clearly; copy and CTA support it.
- **Editorial split**: large type on one side, real media/content on the other, strong but readable alignment.
- **Proof after promise**: value statement first, then logos/testimonials/case data in a separate section.
- **Narrative stack**: sections alternate purpose, such as problem, object, proof, detail, pricing, CTA. Do not repeat the same layout family.
- **Media cadence**: every major section has either a real visual, strong typographic moment, or useful component preview.

## Anti-Abstractness Rules

Different is not enough. A frame that only uses abstraction is usually weaker than a conventional but concrete interface.

Avoid these unless the brief explicitly asks for abstract art direction:

- Large decorative geometric shapes that do not represent product content, brand assets, state, or navigation.
- Abstract gradient backgrounds used as the primary visual.
- Floating panels with cryptic labels and no real object, data, or task.
- Pseudo-scientific diagrams, fake nodes, fake maps, fake signal lines, or fake dashboards that do not correspond to product behavior.
- Misaligned layouts where the only memorable move is that things are off-grid.
- Decorative typography fragments that do not help the user understand or act.
- Visual effects that make the frame distinctive in a screenshot but not better as an interface.

Prefer concrete anchors:

- Realistic product/content objects.
- Actual UI states and useful controls.
- Media or screenshots generated for the section.
- Domain-specific records, messages, charts, documents, thumbnails, maps, or objects.
- A single strong layout move attached to real content.

## Design Dials

Use these as internal variables. They should change the screen, not appear as visible UI.

### STRUCTURE_VARIANCE

How much the layout departs from standard product patterns.

- **1-3 Stable**: conventional native/product layouts. Use for settings, payments, account, admin, regulated flows.
- **4-6 Distinct**: refined hierarchy, asymmetric but predictable groupings. Good default for product surfaces.
- **7-8 Expressive**: editorial or creator-facing GUI with more personality, still task-safe.
- **9-10 Experimental**: use only for playful prototypes, games, or explicitly expressive creative tools.

Default GUI range: **4-6**. Public storytelling pages can use higher structure variance when the requested direction supports it.

### INTERACTION_WEIGHT

How much interaction polish the frame should imply.

- **1-3 Quiet**: hover, focus, pressed, disabled, loading.
- **4-6 Responsive**: sheets, tabs, drawers, segmented controls, reorder states, light transitions.
- **7-8 Playful**: tactile gestures, drag, spring motion, rich previews.
- **9-10 Choreographed**: uncommon in GUI. Use only when the product is creative, game-like, or motion-native.

Default GUI range: **2-5**. Marketing and editorial pages can use higher interaction weight when motion communicates narrative, hierarchy, or brand character.

### INFORMATION_DENSITY

How much useful information appears in one viewport.

- **1-3 Sparse**: onboarding, empty states, creator surfaces, high-focus writing, lifestyle/social moments.
- **4-6 Everyday**: feeds, chats, detail screens, queues, forms.
- **7-8 Dense**: dashboards, admin, moderation, scheduling, project management.
- **9-10 Cockpit**: monitoring, trading, incident response, power-user command centers.

Match density to the expected decision speed. Excess whitespace in operational UI reduces scan efficiency; excessive density in social UI increases cognitive load.

## Surface Presets

### Public / Marketing Page

- STRUCTURE_VARIANCE 5-8, INTERACTION_WEIGHT 3-7, INFORMATION_DENSITY 2-5.
- The first viewport should establish the offer, object, brand, or story quickly.
- Use hero sections, media, testimonials, social proof, logo walls, pricing, and conversion CTAs only when they serve the page goal.
- Avoid generic centered hero, three equal feature cards, vague "modern" copy, decorative gradient backgrounds, and stock imagery that does not reveal the product or brand.
- Section rhythm matters: vary layout families, maintain one visual grammar, and keep CTAs consistent.

### Portfolio / Editorial / Content Page

- STRUCTURE_VARIANCE 5-8, INTERACTION_WEIGHT 2-5, INFORMATION_DENSITY 2-5.
- Prioritize reading flow, media cadence, typography, content hierarchy, and navigation between pieces.
- Use expressive typography and asymmetry only when readability remains strong.
- Avoid decorative metadata, fake issue numbers, and layout flourishes that do not organize real content.

### Mobile Social / Chat

- STRUCTURE_VARIANCE 4-6, INTERACTION_WEIGHT 3-5, INFORMATION_DENSITY 4-6.
- Prioritize reachable controls, readable messages, composer ergonomics, status clarity, safe area, and emotional tone.
- Use avatars, timestamps, receipts, reactions, gift/payment/status objects only when they support the conversation.
- Bottom composers need stable height, clear send affordance, disabled/loading states, and no overlap with content.

### Feed / Discovery

- STRUCTURE_VARIANCE 4-6, INTERACTION_WEIGHT 2-4, INFORMATION_DENSITY 4-6.
- The first viewport should show the purpose, filter/navigation model, and at least one real item.
- Cards are acceptable for repeated objects, but each item needs a stable anatomy: source, title/content, metadata, primary action, secondary affordances.
- Avoid every card having the same visual weight. Let pinned, featured, unread, or actionable items differ for a reason.

### Queue / Inbox / Moderation

- STRUCTURE_VARIANCE 3-5, INTERACTION_WEIGHT 2-4, INFORMATION_DENSITY 6-8.
- Make triage obvious: what is new, what needs action, what is risky, what can wait.
- Batch actions, filters, status chips, and timestamps must be legible and stable.
- Avoid oversized cards that force the user to scroll through work they should scan quickly.

### Dashboard / Analytics

- STRUCTURE_VARIANCE 2-5, INTERACTION_WEIGHT 1-4, INFORMATION_DENSITY 6-8.
- Metrics need context: label, value, trend, time range, comparison, and confidence.
- Numbers align with tabular figures. Charts need labels and empty/loading states.
- Do not decorate data with random cards, glowing dots, or fake-precise numbers.

### Editor / Workspace

- STRUCTURE_VARIANCE 3-6, INTERACTION_WEIGHT 3-6, INFORMATION_DENSITY 5-8.
- Prioritize the working area. Toolbars, sidebars, inspectors, and command surfaces should not compete with the canvas/content.
- Icon-only tools need tooltips and selected/disabled states.
- Stable dimensions matter more than ornamental composition.

### Forms / Settings / Account

- STRUCTURE_VARIANCE 1-4, INTERACTION_WEIGHT 1-3, INFORMATION_DENSITY 4-6.
- Prioritize trust over novelty. Use clear labels, helper text, validation, focus rings, save/cancel affordances, and destructive-action confirmation.
- Settings groups should be organized by user mental model, not by backend schema.

### Onboarding / Empty State

- STRUCTURE_VARIANCE 4-7, INTERACTION_WEIGHT 2-5, INFORMATION_DENSITY 1-4.
- Explain the next action, not the whole product.
- Use one primary action. Secondary actions should be visibly weaker.
- Empty states should show how to populate or recover, not generic motivational copy.

## Foundations

### Existing System First

If the app has tokens, components, a UI library, CSS variables, icons, or a visible product shell, reuse them. Improve within the system unless the user explicitly asks for a new direction.

When no system exists, define a compact local system inside the frame:

- 2-3 semantic text colors.
- 1 brand/accent color plus semantic states only when needed.
- One radius rule.
- One shadow/elevation rule.
- One icon family and stroke style.
- A compact type scale.
- A spacing rhythm.

### Beauty Mechanics

A frame should have visible craft, not only rule compliance.

- **Focal point**: each first viewport needs one dominant object, text block, or work area. If everything has equal weight, the frame looks unfinished.
- **Rhythm**: repeat spacing and component anatomy, then break the rhythm once for emphasis.
- **Contrast**: use size, weight, color, density, or material contrast. Do not rely on color alone.
- **Proportion**: avoid equal columns everywhere. Use ratios such as 5/7, 4/8, 3/9, wide/narrow, dense/open.
- **Depth**: use depth only for real layers: modal, drawer, sticky bar, selected item, preview, or active object.
- **Material**: surfaces should feel intentional: flat utility, paper, glass, tinted panel, media crop, canvas, or technical grid. Do not mix materials without a rule.
- **Edges**: align major edges. Intentional asymmetry still needs clear alignment relationships.
- **Whitespace**: make whitespace frame content. Do not use whitespace as filler when the screen needs density.
- **Copy shape**: short labels and concrete verbs improve visual quality because they create cleaner components.

### One Visual Grammar

Do not mix unrelated visual languages:

- Soft pill controls with sharp industrial cards.
- Dense admin typography with lifestyle gradients.
- Native mobile navigation with unrelated marketing-page section headers.
- Several accent colors competing as decoration.
- Different radii, shadows, and borders without a rule.

## Common Failure Modes

Avoid these patterns unless they are justified by the product context.

- **Undifferentiated cards**: every group inside a rounded white card, often nested inside another card.
- **Default CRUD skin**: gray background, white cards, blue primary buttons everywhere, no product personality.
- **Unsubstantiated dashboard precision**: invented metrics like `99.9%`, `4.8x`, `12,483` without product meaning.
- **Decorative status dots**: colored dots on every row, badge, nav item, and label.
- **Marketing copy in app chrome**: slogans where the user expects object names, task labels, or current state.
- **Excessive eyebrow labels**: uppercase micro-labels above every panel heading.
- **Unlabeled icon controls**: icon buttons without labels, tooltip, or accessible name.
- **Uniform item weight**: repeated content forced into identical boxes even when item importance differs.
- **Unreachable mobile actions**: key controls too high, too small, or hidden behind overflow.
- **Placeholder-as-label forms**: inputs lose meaning once text is entered.
- **Low-contrast disabled text**: disabled, helper, and placeholder text too faint to read.
- **Decorative glass**: blur/frosted panels that reduce legibility without explaining layering.
- **Random gradients**: background treatments unrelated to brand, state, or hierarchy.
- **Generic social filler**: generic names, generic avatars, generic comments, generic "just now" metadata.
- **Hollow abstraction**: distinctive shapes, gradients, or diagrams with no concrete product/content anchor.
- **Over-designed emptiness**: sparse layouts where the content model is too thin to judge the interface.

## Layout Rules

### Purpose In Two Seconds

The user should know:

- Where they are.
- What object or workflow is active.
- What needs attention.
- What action is primary.

Screen titles should name the product object or task. Avoid vague slogans inside app UI.

### Primary Action Placement

Put the primary action where the user finishes the decision:

- Composer send button at the composer.
- Form save near the form footer or sticky bottom bar.
- Queue actions inside each item and optionally as batch toolbar.
- Editor publish/export in the top bar only when global to the workspace.

Avoid two CTAs with the same intent. Use one label per intent across the frame.

### Stable Dimensions

Fixed-format UI needs stable size:

- Toolbars, icon buttons, tabs, cards, table rows, message bubbles, counters, avatars, media cells, and bottom bars should not resize when content changes.
- Use `minWidth`, `maxWidth`, `aspectRatio`, `gridTemplateColumns`, line clamps, and overflow rules.
- Text should truncate or wrap intentionally, never collide with neighboring controls.

### Cards

Use cards only for repeated items, modals, drawers, and clearly framed tools.

- Do not put cards inside cards.
- Do not style whole page sections as floating cards.
- When every group is boxed, elevation no longer communicates hierarchy.
- Prefer separators, alignment, whitespace, and background bands when elevation does not communicate a real layer.

### Navigation

- Mobile top bars should fit one line and keep important actions reachable.
- Bottom tabs should be 3-5 items, with icon and short label unless the app convention says otherwise.
- Desktop sidebars should separate global navigation from local filters/tools.
- Tabs switch peer views. Segmented controls switch modes or filters. Do not swap these patterns randomly.

## Typography

- Use the app's existing font stack first.
- System UI fonts are acceptable and often correct for GUI.
- Avoid hero-scale display type inside panels, cards, modals, and dense app shells.
- Numbers should use tabular figures where comparison matters.
- Body and metadata need clear contrast, especially on mobile.
- Chinese UI copy needs enough line height and should avoid cramped mixed Latin/Chinese labels.
- Reserve uppercase tracking for rare labels. Most GUI labels should be sentence case or native app style.

## Color

- Start with neutrals and semantic roles: text, muted text, surface, muted surface, border, accent, success, warning, danger.
- Use one brand accent for primary actions and selection.
- Semantic colors should mean state, not decoration.
- Do not assign each list item a random accent unless color encodes category or status.
- Warning and destructive states must be visually distinct from brand accent.
- Check contrast for buttons, input text, placeholder text, helper text, badges, selected tabs, and disabled controls.

## Controls

Expected GUI controls should look and behave like controls:

- Buttons for commands.
- Icon buttons for compact tool actions, with aria labels and tooltips when unfamiliar.
- Segmented controls for mutually exclusive modes.
- Tabs for view switching.
- Toggles/checkboxes for boolean settings.
- Sliders/steppers/inputs for numeric values.
- Menus for option sets.
- Chips for filters or selected tags, not every piece of metadata.

Every interactive control needs at least the relevant states:

- Default.
- Hover or touch feedback.
- Pressed/active.
- Focus-visible.
- Disabled.
- Loading or pending when action is async.
- Selected/current where applicable.
- Error or destructive where applicable.

## Lists, Tables, Feeds

### Repeated Items

Every repeated item should answer:

- What is it?
- Who or where did it come from?
- Why is it here now?
- What is its status?
- What can the user do next?

Avoid rendering all metadata as small, low-contrast text. Metadata that changes decisions deserves visual weight.

### Tables

Use table-like layouts when users compare rows and columns.

- Align numbers right or with tabular figures.
- Keep headers visible or repeated when the table scrolls.
- Include sort/filter states when implied.
- Use sparse separators, not heavy boxes around every cell.
- Provide loading, empty, and error states.

### Feeds

Feed items should have rhythm:

- Mix text, media, compact, expanded, pinned, unread, or sponsored states only when meaningful.
- Avoid endless identical white cards.
- Filters should be close to the feed and show selected state clearly.

## Forms

- Labels sit above fields.
- Placeholder text is not a label.
- Helper text explains constraints before error.
- Error text appears near the field and says how to recover.
- Required/optional signals should be consistent.
- Related fields should be grouped.
- Destructive changes need confirmation and clear consequence text.
- Long forms need progress, grouping, save state, or sticky footer actions.

## Chat And Messaging

- Chronology and authorship must be obvious.
- Message bubbles need max width and readable wrapping.
- Timestamps should be present but not dominate.
- System messages, gifts, payments, attachments, and moderation events need distinct but restrained treatments.
- Composer should show what can be sent: text, media, gift, voice, command, or disabled state.
- Avoid overly cute copy when the moment is transactional or trust-sensitive.

## Motion

GUI motion should communicate:

- Feedback: the user acted.
- Continuity: a sheet opened from a button, an item moved, a selection changed.
- Attention: new, unread, risky, or successful state.
- Spatial relation: drawer, modal, tab, carousel, drag, reorder.

Avoid:

- Scrolltelling in routine app screens.
- Infinite animations on every card.
- Motion that delays work.
- Animating layout properties that cause jank.
- Motion without reduced-motion fallback when implemented in real code.

## Content

- Use realistic, domain-specific sample data.
- Avoid generic names like "John Doe", "Acme", "Nexus", "SmartFlow".
- Use labels the product user would actually say.
- Prefer concrete verbs: Reply, Publish, Archive, Save, Invite, Review, Resolve.
- Do not invent operational guarantees, revenue numbers, compliance claims, payment policy, moderation promises, or safety outcomes.
- Mark mock data in code comments only when fake precision could mislead future implementers.

## GUI Pre-Flight Check

Run this before delivery. If an item fails, revise the frame.

- [ ] Design read is clear enough to explain the visual direction.
- [ ] Visual anchor is concrete and visible in the frame.
- [ ] Aesthetic family, type strategy, color/material strategy, and one memorable move are chosen before TSX.
- [ ] Surface kind and primary job are obvious within two seconds.
- [ ] Dials match the surface. No GUI density forced into a public storytelling page; no marketing-page composition forced into operational UI.
- [ ] Existing tokens/components/icons are reused where available.
- [ ] One radius system, one shadow/elevation rule, one icon family.
- [ ] One brand accent plus semantic state colors. No random rainbow accents.
- [ ] Text hierarchy fits the container. No hero-scale type inside compact UI.
- [ ] Primary action is obvious and placed at the decision point.
- [ ] No duplicate CTA intent.
- [ ] Navigation pattern matches the platform and fits the viewport.
- [ ] Cards are used only where they communicate repeated objects or real layers.
- [ ] No card-inside-card composition.
- [ ] Lists/feeds show source, status, metadata, and next action where needed.
- [ ] Tables align comparable values and provide headers/states.
- [ ] Forms use labels, helper text, validation, and recovery text.
- [ ] Every meaningful control has disabled, selected/current, focus, and loading/pending states when relevant.
- [ ] Icon-only controls have accessible names and tooltips when unfamiliar.
- [ ] Mobile hit targets are large enough and reachable.
- [ ] Bottom bars, composers, modals, and sticky controls do not cover essential content.
- [ ] Text wraps, truncates, or clamps intentionally. No overlap.
- [ ] Empty/loading/error states are represented when they affect the surface.
- [ ] Sample data is realistic and domain-specific.
- [ ] Numbers and statuses are not fake-precise decoration.
- [ ] Visual assets are product-relevant, not stock decoration.
- [ ] No hollow abstraction: decorative shapes/effects are tied to content, state, brand, or navigation.
- [ ] Frame has a focal point, rhythm, contrast, proportion, and intentional material treatment.
- [ ] Motion, if implied, communicates feedback, continuity, attention, or spatial relation.
- [ ] Contrast is readable for body, metadata, buttons, badges, placeholders, and disabled states.
- [ ] The frame would still look intentional after real data replaces sample data.
