---
name: ue-widget-developer
description: Use when Codex needs to create, inspect, edit, validate, or wire Unreal Engine 5.7 UMG Widget Blueprints for MistyPlanet through the private MCP bridge.
---

# UE Widget Developer

Use the private MCP bridge for MistyPlanet UI work only. Limit changes to UMG Widget Blueprints under `/Game/MistyPlanet/UI/` and generated UI helper code under `Source/MistyPlanet/Public/UI/Generated/` and `Source/MistyPlanet/Private/UI/Generated/`.

## Skill Precedence

For MistyPlanet UMG Widget Blueprint work, this skill is the primary workflow and supersedes generic creative/design workflows such as brainstorming. Figma node review is the design gate for non-trivial UI in this workflow.

Do not route MistyPlanet Widget Blueprint work through generic brainstorming or unrelated implementation-planning skills. This skill contains the required discovery, Figma review, validation, apply, finalize, and visual-verification gates.

Do not write a superpowers spec or implementation plan for routine widget creation.

## Rules

- Inspect before every edit. Preserve existing widget names, hierarchy, bindings, and user-authored behavior unless the request changes them.
- Before designing new or redesigned UI, gather project UI context using `references/project-ui-context.md`.
- Before generating Figma, run the visual originality gate in `references/visual-design-rubric.md`. Define visual direction, composition, motif, palette, density, project references, and a deliberate difference from recent local work.
- Use Figma frames and semantic layer names as the source protocol. Do not use DSL or HTML as intermediate source formats.
- Layer names must use `Role/WidgetName`: `Panel/`, `VerticalBox/`, `HorizontalBox/`, `Scroll/`, `Text/`, `Button/`, `Slider/`, `Toggle/` or `CheckBox/`, and `Select/` or `ComboBox/`.
- AI should create native Figma frames, auto-layout, text, and component instances through the available Figma integration, then pass the exported Figma node JSON to the MCP bridge.
- Before writing a non-trivial Figma layout to Unreal, call `ue.ui.review_figma_widget` and inspect `diagnostics`, `lossReport`, and `quality`. Do not write while any error remains.
- Prefer `ue.ui.apply_figma_widget`. It imports the Figma node, validates the resulting UMG layout, applies it, binds supported events, and finalizes the widget in one guarded sequence.
- For hand-authored layout JSON only, call `ue.ui.validate_widget_layout` before `ue.ui.apply_widget_layout`.
- For non-trivial widgets, create or update the C++ `UUserWidget` base class first, compile it in Unreal, then create or reparent the Widget Blueprint before binding events or writing layout.
- Finalize after every widget edit with `ue.ui.finalize_widget` when the apply tool did not already finalize.
- Visually inspect the finished Widget Blueprint in Unreal Designer. Compile/save alone is not UI completion.
- Wire buttons, sliders, checkboxes, and combo boxes only through bridge binding tools.
- Do not use raw Python, raw Unreal Remote Control, direct asset mutation, or ad hoc editor scripting.
- Do not touch non-UI assets, gameplay files, Config, plugin files, or shared source unless the user explicitly scopes a UI helper generation task.
- Do not commit private tool artifacts or generated local bridge files.

## Workflow

1. Check bridge status and inspect the target widget tree.
2. For non-trivial widgets, generate and compile the C++ base class, then create or reparent the Widget Blueprint.
3. Gather project UI evidence and write the design-language brief plus visual direction note.
4. Have AI generate the Figma screen using native Figma nodes and the semantic layer naming convention.
5. Call `ue.ui.review_figma_widget` with the Figma root node and the appropriate quality profile. Fix every reported diagnostic, conversion loss, or quality error.
6. Call `ue.ui.apply_figma_widget` with explicit bindings after review passes.
7. Bind any remaining supported events, then finalize if necessary.
8. Visually verify the result in Unreal Designer and report compiler or validation diagnostics.

For tool sequence details and payload examples, read `references/tool-workflow.md`.
