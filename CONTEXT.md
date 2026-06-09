# Runelight

Runelight is a GUI development workflow for agent-built apps. Its language distinguishes production component state coverage from exploratory product design drafts shown in Studio.

## Language

**Website Visitor**:
A developer or technical lead evaluating Runelight for TypeScript React or Vue apps built with AI agents. They need fast evidence that Runelight changes their UI workflow, not a generic product brochure.
_Avoid_: generic visitor, designer-only visitor, passive reader

**Self-Demonstrating Website**:
A Runelight-powered public website whose own design and component states are inspectable in Studio. It uses the same visual workflow it presents, so the website can be reviewed as a **Runelight Project**.
_Avoid_: marketing site only, external showcase, screenshot-only demo

**Public Studio Showcase**:
The publicly reachable Studio view for the deployed **Self-Demonstrating Website**, not just a local development tool. It is a visitor-facing proof point, secondary to the GitHub call to action, where the website's own design frames and component frames can be inspected.
_Avoid_: private dev route, internal QA page, screenshot gallery

**GitHub-First Website**:
A public Runelight website whose first job is to explain the category in one screen and send the **Website Visitor** to GitHub for installation, docs, and source proof. Studio remains visual evidence, not the primary conversion path.
_Avoid_: multi-section product brochure, install funnel, documentation site

**One-Screen Category Story**:
The homepage story for a **GitHub-First Website**: one tip line, one large headline, and one subtitle. For Runelight, the locked story is "THE GUI WORKSPACE FOR AGENT-BUILT APPS", "Every visual branch on one screen.", and "Design, build, and review AI-era GUI workflows without clicking through your app."
_Avoid_: multi-paragraph hero, stacked feature claims, repeated installation copy, abstract model explanation

**Homepage Visual Proof**:
The single proof image on the **GitHub-First Website** homepage. It should be a real Studio Components board screenshot that shows multiple **Visual Branches** on one screen, with a small "LIVE FROM THIS REPO /runelight/studio" annotation if needed.
_Avoid_: generated hero collage, design-board screenshot, install prompt, abstract artwork, decorative product mockup

**Agent Client GUI Workspace**:
A browser-operable Studio workspace that fits into desktop AI agent clients such as Codex or Cursor. The agent client can already open and manipulate web pages; Runelight adds the missing UI-state layer between the codebase and the rendered page, so agents can design, inspect, and refine declared GUI branches instead of guessing from code alone.
_Avoid_: native agent-client plugin, chat panel, mockup tool, generic browser preview

**Host**:
The user's framework runtime that renders the app and Runelight preview surfaces for a **Runelight Project**. The **Host** remains responsible for component execution even when Runelight owns the user-facing launch command.
_Avoid_: standalone renderer, mock framework runtime, replacement app shell

**Runelight Route Space**:
The conventional local route space under `/runelight` where Studio, manifests, and preview renders live inside the **Host**. It belongs to Runelight and is treated as reserved project-local tooling space rather than user app surface.
_Avoid_: custom preview route namespace, user-owned app route, configurable Studio path

**Runelight-Owned Launch Layer**:
The Runelight command surface that starts and coordinates Studio, capture, and related workflows while still rendering through the project's **Host**. It gives users a Runelight-first way to begin work; the project's Host launch instructions may still declare how that Host starts.
_Avoid_: hostless preview, separate app shell, framework replacement, framework autodetection as the core promise

**Runelight Serve Session**:
The long-lived local development session started by `runelight serve`. It is owned by the foreground **Runelight Serve Supervisor**, enters **Runelight Dev Mode**, and makes Studio and capture available as capabilities of the running session.
_Avoid_: Studio-only launch command, capture-only launch command, ordinary framework dev server, background launcher

**Runelight Serve Supervisor**:
The foreground CLI process that owns a **Runelight Serve Session**. It coordinates Host startup, session availability, logs, and shutdown so the user has one obvious process to watch and stop.
_Avoid_: detached background owner, orphaned Host process, hidden dev server

**Runelight Serve Port**:
The localhost port selected and owned by the **Runelight Serve Supervisor** for a **Runelight Serve Session**. The wrapped **Host** must bind this port; if it cannot, the supervisor chooses another port or fails explicitly instead of accepting silent Host port drift.
_Avoid_: Host-owned default port, silent port fallback, unverified actual port

**Runelight Serve Session Registry**:
The local runtime registry where active **Runelight Serve Sessions** publish their project identity, process id, port, and base URL as discoverable hints. Other Runelight commands may attach to a registered session only after confirming that the process, project identity, and **Runelight Route Space** are healthy.
_Avoid_: source of truth, trusted port file, project config, unchecked pid cache

**Host Launch Instructions**:
The project-owned declaration that tells the **Runelight-Owned Launch Layer** the underlying **Host** command to wrap. Project scripts should point at Runelight, while Runelight uses this declaration to start Vite, Next.js, or another supported Host in **Runelight Dev Mode**.
_Avoid_: preview serve script, autodetected framework command, hostless launch config

**Runelight Dev Mode**:
The explicit development mode entered during a **Runelight Serve Session** when the Host process receives `RUNELIGHT_DEV=1`. In this mode the **Runelight Route Space** and preview transforms are enabled; outside it, Host behavior should match ordinary app development and production.
_Avoid_: NODE_ENV as the Runelight switch, always-on Studio routes, always-on preview transforms

**Preview Transform**:
The Runelight transform mode that prepares a `.g` entry for Studio rendering by wiring preview seams and preserving the frame data needed by the **Runelight Route Space**. It is for preview graphs, not ordinary app graphs.
_Avoid_: production transform, blanket .g transform, frame stripping

**Frame Elision**:
The Runelight transform mode that removes frame declarations from ordinary app graphs so source-level frame data does not ship or execute as app code. It remains relevant outside **Runelight Dev Mode** and for non-preview app paths inside a **Runelight Serve Session**.
_Avoid_: disabling all transforms outside Runelight Dev Mode, shipping frames, relying on dead-code elimination

**Curated Frame Set**:
A deliberately named group of design frames and component frames selected for visitor understanding. It should explain Runelight's visual model rather than expose every internal UI fragment.
_Avoid_: exhaustive component inventory, internal scratch dump, unordered frame list

**Source-Level Visual Model**:
A source-code representation of GUI branches that people and AI agents can inspect, render, and verify. It connects product design and production code through the same project context instead of treating visuals as detached artifacts.
_Avoid_: screenshot, mockup handoff, preview wrapper, visual test only

**Visual Branch**:
A meaningful path the GUI can render, such as empty, loaded, errored, anonymous, admin, compact, or overflowing. Public product language should prefer this term over "UI state"; a **Frame** makes a visual branch presentable and reviewable.
_Avoid_: abstract UI state, hidden render path, test case only

**Proof Panel**:
A product explanation that traces one **Visual Branch** from source condition to frame declaration to Studio rendering. It proves Runelight by showing the model, the declaration, and the rendered result together.
_Avoid_: static screenshot, isolated code snippet, feature card

**Positive Category Narrative**:
The website's way of explaining Runelight by defining its own model and workflow directly. It should not depend on comparisons against mockup tools, preview tools, or screenshot testing to make Runelight feel important.
_Avoid_: competitor comparison, "not another" positioning, category attack

**Design Workspace**:
The Studio area for AI-assisted product GUI exploration and design critique. It is for trying product directions before committing to production component coverage.
_Avoid_: standalone HTML design workflow, external mockup board

**Design Frame**:
An exploratory design draft that presents one coherent product moment for visual critique. It is separate from a **Component Frame**, which exists to cover meaningful visual states of a production component.
_Avoid_: screenshot, generated layout position, component coverage frame

**Component Frame**:
A declared visual state of a production component. Component frames are about coverage and verification, not broad product direction exploration.
_Avoid_: design draft, mockup alternative

**Framework-Specific Design Skill**:
An agent workflow for GUI exploration in one supported framework. Setup installs the matching design skill for the user's project, so the skill can speak that framework's frame format directly instead of routing across frameworks.
_Avoid_: generic design router, cross-framework design skill

**Self-Contained Design Skill**:
A framework-specific design skill directory that carries the workflow and visual quality references it needs. It should not require installing a separate shared design skill.
_Avoid_: shared design skill, hidden router dependency

## Example Dialogue

Designer: "I want to explore three settings-page directions before we build."
Agent: "That belongs in the Design Workspace as three Design Frames."
Designer: "Should those count as component coverage?"
Agent: "No. Component Frames come later when the production settings components need declared visual states."
Designer: "Should one design skill handle React and Vue?"
Agent: "No. Setup installs the Framework-Specific Design Skill that matches the project."
Designer: "Should there be a shared design skill too?"
Agent: "No. Each Framework-Specific Design Skill should be self-contained."

Developer: "The website should show Runelight by using Runelight itself."
Agent: "That makes it a Self-Demonstrating Website: its own design frames and component frames should be inspectable in the Public Studio Showcase."
Developer: "Should the homepage say UI states?"
Agent: "Prefer Visual Branches in public product language. A Frame makes one branch presentable and reviewable."
Developer: "Should we compare against existing tools?"
Agent: "No. Use a Positive Category Narrative: define the Source-Level Visual Model directly."

Developer: "Should Runelight replace Vite or Next.js when I open Studio?"
Agent: "No. The Host still renders the app and preview surfaces; the Runelight-Owned Launch Layer owns the command that starts and coordinates the workflow from the project's Host launch instructions."
Developer: "Should the project still call this preview.serve?"
Agent: "No. Treat it as Host Launch Instructions so the config language matches the Runelight-first CLI."
Developer: "Should every project customize the Studio and preview paths?"
Agent: "No. Use the Runelight Route Space under /runelight by convention."
Developer: "Should ordinary dev mode expose Runelight routes?"
Agent: "No. Runelight Dev Mode is explicit: a Runelight Serve Session wraps the Host command and enables routes and transforms only for that process."
Developer: "Should capture trust a saved port from a previous serve?"
Agent: "Only through the Runelight Serve Session Registry, and only after checking that the process and Runelight Route Space are still healthy."
Developer: "Does RUNELIGHT_DEV mean all transforms are disabled outside serve?"
Agent: "No. Preview Transform is gated by Runelight Dev Mode, but Frame Elision still protects ordinary app graphs."
