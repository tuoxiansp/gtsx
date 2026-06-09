---
name: write-intelligence-test
description: Write or revise `intelligence-tests/*.it.md` task cards for agent-driven end-to-end validation in this Runelight repository. Use when the user asks to add, edit, or design `.it.md` intelligence test scenarios or expected user experiences.
---

# Write Intelligence Test

Write `.it.md` files as task cards for a future agent to execute.

An intelligence test is an agent-driven end-to-end check written in natural language. It tells a capable agent what product behavior or user experience to validate, then lets the agent choose the concrete commands, browser steps, HTTP checks, edits, and observations from repo context.

Make the test boundary obvious:

- What should the agent start with?
- What should the agent change, run, open, or observe?
- What user-visible or runtime outcomes must be true?
- What temporary files, projects, servers, or artifacts should be cleaned up?

Do not write a tutorial, rationale, runner syntax, or implementation commentary. Do not assume an already-prepared local project proves setup behavior unless the task explicitly says to test that prepared project.

Intelligence tests can be heavier than unit tests. Prefer grouping related goals into one realistic flow when they share setup, dev server, browser session, or temporary files. Use them for behavior that unit tests do poorly: setup outcomes, cross-system integration, dev-server/runtime behavior, multi-step user workflows, generated artifacts, and user-visible product experience.

Keep the file short and direct. Trust the executing agent to choose commands and tools from the repo context.

See [docs/testing.md](../../docs/testing.md). For the docs vs skills boundary, see [CONTRIBUTING.md](../../CONTRIBUTING.md).
