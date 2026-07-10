---
name: ue-widget-developer
description: Use when Codex needs to create, inspect, edit, validate, or wire Unreal Engine 5.7 UMG Widget Blueprints for MistyPlanet through the private MCP bridge.
---

# UE Widget Developer

Use the private MCP bridge for MistyPlanet UI work only. Limit changes to UMG Widget Blueprints under `/Game/MistyPlanet/UI/` and generated UI helper code under `Source/MistyPlanet/Public/UI/Generated/` and `Source/MistyPlanet/Private/UI/Generated/`.

## Skill Precedence

For MistyPlanet UMG Widget Blueprint work, this skill is the primary workflow and supersedes generic creative/design workflows such as brainstorming. Widget DSL web review is the design gate for non-trivial UI in this workflow.

Do not route MistyPlanet Widget Blueprint work through generic brainstorming, superpowers specs, writing-plans, frontend-design, or unrelated implementation-planning skills merely because the request involves creating, redesigning, styling, or wiring UI. This skill already contains the required discovery, layout-spec, DSL review, user-approval, validation, apply, finalize, and visual-verification gates.

Do not write a superpowers spec or implementation plan for routine widget creation. Use generic brainstorming only when the user explicitly asks for open-ended product ideation before any UE widget work, or when the request is not yet scoped to a MistyPlanet Widget Blueprint.

## Rules

- Inspect before every edit. Read the existing widget tree and preserve names, hierarchy, bindings, and user-authored behavior unless the request explicitly changes them.
- Before designing new or redesigned UI, gather project UI context. First search for written UI/design/style guidance; if none exists, infer the project's UI language from existing screens, reusable components, art assets, fonts, icons, and materials. Use `references/project-ui-context.md` for the universal search order, evidence note, and design-language brief.
- Use a layout spec for creation and layout edits. Define widget names, classes, hierarchy, anchors, offsets, alignment, size, text, style-relevant properties, and intended bindings before applying layout.
- For non-trivial new UI or redesigns, use Widget DSL as the source protocol. Do not use HTML as the source of truth; the generated HTML Review Console is a controlled inspection surface generated from the DSL.
- Product UI must look designed, not like default UMG controls. For settings/menu screens, use a styled shell, clear visual hierarchy, tab/page or scroll structure, deliberate spacing, and action rows.
- Before drafting non-trivial UI, run the project context gate in `references/project-ui-context.md` and the visual originality gate in `references/visual-design-rubric.md`. Do not reuse the examples in this skill as a layout template. Define a visual direction that follows the inferred project UI language, plus composition archetype, motif, palette, density, project references used, and at least one deliberate difference from recent local prototypes or review outputs before writing DSL.
- Before writing a non-trivial DSL layout to Unreal, call `ue.ui.review_widget_dsl` and inspect `diagnostics`, `lossReport`, `quality`, and `reviewQuality`. Do not write if any diagnostics, loss entries, or error issues remain.
- Prefer `ue.ui.apply_widget_dsl` for DSL-driven writes. It compiles the DSL, validates layout/review quality, applies the UMG layout, binds supported events, and finalizes the widget in one guarded sequence.
- For DSL-driven layout writes, use `ue.ui.review_widget_dsl` followed by `ue.ui.apply_widget_dsl`; `apply_widget_dsl` performs its guarded validation path. For hand-authored layout JSON only, call `ue.ui.validate_widget_layout` with the target profile and viewport before `ue.ui.apply_widget_layout`.
- For non-trivial widgets, create or update the C++ `UUserWidget` base class first, compile it in Unreal, then create or reparent the Widget Blueprint to that class before binding events or writing the asset layout.
- When generated C++ requires a normal UBT rebuild, use `ue.project.rebuild_cpp_with_editor_restart` so the tool closes UE, builds C++, and reopens UE without asking the user to do it manually.
- Use `ue.blueprint.inspect` for read-only context on any Blueprint under `/Game/` when you need to understand its parent class, functions, variables, components, or graph summary before editing UI. Non-UI Blueprints are inspect-only context; do not write to them.
- Run a style/layout pass before any asset write. Confirm hierarchy, spacing, anchors, slot rules, text, colors, visibility, paging/scroll behavior, and setting-control names in the spec before calling create/apply layout tools.
- Use the game's default fullscreen viewport as the primary layout baseline for new or redesigned widgets. Do not hard-code a fixed resolution as the design target; treat the root canvas as fullscreen/fill-parent and keep the layout scalable for common fullscreen resolutions. If a review or validation tool requires numeric viewport values, use the current target fullscreen viewport and state that value in the review notes.
- Do not accept compile/save as UI completion. After writing UI, visually inspect the widget in Unreal Designer and check that text fits, controls are aligned, content is not cramped, and default gray UMG styling is not dominating the screen. Use screenshot verification only when the bridge exposes a screenshot/preview capture tool.
- Finalize after every Widget edit with `ue.ui.finalize_widget`. It compiles the Widget Blueprint, saves the package, and can return the final widget tree. Report compiler or validation diagnostics.
- Wire supported UI events only through bridge binding tools. Bind buttons, sliders, checkboxes, and combo boxes to existing or generated Blueprint-callable UI functions with compatible signatures.
- Do not use raw Python, raw Unreal Remote Control, direct asset mutation, or ad hoc editor scripting.
- Do not touch non-UI assets, gameplay files, Content outside `/Game/MistyPlanet/UI/`, Config, plugin files, or shared project source unless the user explicitly scopes a UI helper generation task through the bridge.
- Do not commit private tool artifacts or generated local bridge files.

## Workflow

1. Check bridge status.
2. Inspect the target widget tree.
3. For non-trivial widgets, generate/write the C++ base class first, compile it in Unreal, and use it as the Widget Blueprint parent.
4. For new or redesigned UI, read `references/project-ui-context.md`, gather design evidence from project UI docs or existing UI assets, and write a design-language brief. Then read `references/visual-design-rubric.md`. Write a short visual direction note before DSL. The note must cite the project references used, show how the design follows the project UI language, reject the obvious template, and identify what makes this design different.
5. Draft or normalize the layout spec inside this skill. Keep it as the Widget DSL/layout source for the bridge workflow; do not create a generic brainstorming or superpowers spec unless the user explicitly asks for that.
6. For DSL-driven UI, call `ue.ui.review_widget_dsl` and open/use the generated web Review Console for user approval before writing the asset. Alt-click a widget to inspect its stable name, simulate its visual states, and use that name when asking AI for a focused DSL revision. Create or update the review HTML before any Unreal asset mutation.
7. Perform the style/layout pass before writing the asset. Fix all `diagnostics`, `lossReport`, `quality`, and `reviewQuality` errors. Reject the DSL yourself if it looks like the default example, previous prototype, or a plain form.
8. Prefer `ue.ui.apply_widget_dsl` with explicit bindings for DSL-driven writes. For hand-authored layout JSON only, run `ue.ui.validate_widget_layout` and then call `ue.ui.apply_widget_layout`.
9. Bind supported control events through MCP tools if they were not supplied to `ue.ui.apply_widget_dsl`.
10. Run `ue.ui.finalize_widget` with `compile: true`, `save: true`, and `inspect: true` if the apply tool did not already finalize.
11. Visually verify the result in the widget designer before reporting completion. Use screenshots only when the bridge supports capture.
12. If generated C++ changed, run `ue.project.rebuild_cpp_with_editor_restart` by default. Use `ue.project.build_cpp` only when UE is already closed or a no-restart build is explicitly wanted.

For tool sequence details and examples, read `references/tool-workflow.md`.
