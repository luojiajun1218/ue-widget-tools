# Visual Design Rubric

Use this before drafting Widget DSL for non-trivial new UI or redesigns. The goal is not decoration; the goal is to avoid generic, repeated, default-looking UMG screens.

## Visual Originality Gate

Write a short note with these fields before DSL:

- `project_sources`: the UI docs or existing UI assets inspected first.
- `observed_language`: what the project already does visually.
- `design_language_fit`: how this design follows the inferred project UI language.
- `intent`: what the player is trying to do in this screen.
- `visual_direction`: one concrete direction tied to MistyPlanet's mood, not a generic admin panel.
- `composition`: the screen structure, such as command console, split inspector, staged wizard, dense dashboard, radial hub, bottom-docked controls, or layered map overlay.
- `motif`: a repeated shape or material idea, such as glass panels, scanline dividers, terminal strips, equipment labels, mission cards, or calibration readouts.
- `palette`: 3-5 colors with roles; avoid one-hue palettes and default gray controls.
- `density`: spacious, balanced, or compact; explain why.
- `template_rejection`: name the obvious stale pattern and how this design differs.

If the note cannot explain a difference from the previous prototype or the examples in `tool-workflow.md`, stop and choose a different composition.

If the note cannot cite project UI sources and explain `design_language_fit` from `project-ui-context.md`, stop and gather project UI context first.

## Anti-Templates

Do not use these as the default answer:

- centered fixed settings rectangle with title, left tabs, right form, bottom buttons
- full-screen page that is only left tabs plus rows in one plain panel
- dark panel plus accent buttons with no motif, hierarchy, or content grouping
- repeated `SettingsRoot` / `SettingsLayout` / `SettingsTabs` structure copied from examples
- UMG default gray controls, unstyled buttons, or raw form rows as the main visual language

Examples in this skill are protocol examples, not visual templates.

## Required Variation

For each redesign, change at least three of these from the last local prototype:

- composition archetype
- navigation placement
- header treatment
- control grouping
- panel geometry or layering
- palette roles
- typography scale
- action placement
- use of imagery, icons, readouts, or status elements

For settings screens, tabs are allowed but not mandatory. If tabs are used, make the surrounding composition distinctive: status rail, preview zone, grouped modules, contextual footer, or category-specific panels.

## Review Pass

Before writing to Unreal, inspect the generated HTML and reject it if:

- it could be described as "same as the last one with different labels"
- it has no strong first-screen visual signal
- all panels have similar size, color, and weight
- spacing is mathematically tidy but visually lifeless
- controls dominate the screen without framing, summaries, previews, or hierarchy
- it looks like a web admin form instead of game UI

If rejected, revise the visual direction note first, then regenerate DSL.
