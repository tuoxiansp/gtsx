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
