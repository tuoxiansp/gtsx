# Runelight

Runelight is a GUI development workflow for agent-built apps. Its language distinguishes production component state coverage from exploratory product design drafts shown in Studio.

## Language

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
