---
name: ue-widget-developer
description: Use when Codex needs to create, inspect, edit, validate, or wire Unreal Engine 5.7 UMG Widget Blueprints for MistyPlanet through the private MCP bridge.
---

# UE Widget Developer

Use the private MCP bridge for MistyPlanet UI work only. Limit changes to UMG Widget Blueprints under `/Game/MistyPlanet/UI/` and generated UI helper code under the project UI folders exposed by the bridge.

## Rules

- Inspect before every edit. Read the existing widget tree and preserve names, hierarchy, bindings, and user-authored behavior unless the request explicitly changes them.
- Use a layout spec for creation and layout edits. Define widget names, classes, hierarchy, anchors, offsets, alignment, size, text, style-relevant properties, and intended bindings before applying layout.
- For non-trivial new UI or redesigns, use Widget DSL as the source protocol. Do not use HTML as the source of truth; HTML is only a review render generated from the DSL.
- Product UI must look designed, not like default UMG controls. For settings/menu screens, use a styled shell, clear visual hierarchy, tab/page or scroll structure, deliberate spacing, and action rows.
- Before writing a non-trivial DSL layout to Unreal, call `ue.ui.review_widget_dsl` and inspect `diagnostics`, `lossReport`, `quality`, and `reviewQuality`. Do not write if any diagnostics, loss entries, or error issues remain.
- Prefer `ue.ui.apply_widget_dsl` for DSL-driven writes. It compiles the DSL, validates layout/review quality, applies the UMG layout, binds supported events, and finalizes the widget in one guarded sequence.
- Before any non-trivial layout write, call `ue.ui.validate_widget_layout` with the target profile and viewport. Do not call `ue.ui.apply_widget_layout` until the validator returns `ok: true`.
- For non-trivial widgets, create or update the C++ `UUserWidget` base class first, compile it in Unreal, then create or reparent the Widget Blueprint to that class before binding events or writing the asset layout.
- When generated C++ requires a normal UBT rebuild, use `ue.project.rebuild_cpp_with_editor_restart` so the tool closes UE, builds C++, and reopens UE without asking the user to do it manually.
- Use `ue.blueprint.inspect` for read-only context on any Blueprint under `/Game/` when you need to understand its parent class, functions, variables, components, or graph summary before editing UI.
- Run a style/layout pass before any asset write. Confirm hierarchy, spacing, anchors, slot rules, text, colors, visibility, paging/scroll behavior, and setting-control names in the spec before calling create/apply layout tools.
- Use the game's default fullscreen viewport as the primary layout baseline for new or redesigned widgets. Do not hard-code a fixed resolution as the design target; treat the root canvas as fullscreen/fill-parent and keep the layout scalable for common fullscreen resolutions. If a review or validation tool requires numeric viewport values, use the current target fullscreen viewport and state that value in the review notes.
- Do not accept compile/save as UI completion. After writing UI, visually inspect the widget in Unreal or through a screenshot and check that text fits, controls are aligned, content is not cramped, and default gray UMG styling is not dominating the screen.
- Finalize after every Widget edit with `ue.ui.finalize_widget`. It compiles the Widget Blueprint, saves the package, and can return the final widget tree. Report compiler or validation diagnostics.
- Wire supported UI events only through bridge binding tools. Bind buttons, sliders, checkboxes, and combo boxes to existing or generated Blueprint-callable UI functions with compatible signatures.
- Do not use raw Python, raw Unreal Remote Control, direct asset mutation, or ad hoc editor scripting.
- Do not touch non-UI assets, gameplay files, Content outside `/Game/MistyPlanet/UI/`, Config, plugin files, or shared project source unless the user explicitly scopes a UI helper generation task through the bridge.
- Do not commit private tool artifacts or generated local bridge files.

## Workflow

1. Check bridge status.
2. Inspect the target widget tree.
3. For non-trivial widgets, generate/write the C++ base class first, compile it in Unreal, and use it as the Widget Blueprint parent.
4. Draft or normalize the layout spec.
5. For DSL-driven UI, call `ue.ui.review_widget_dsl` and open/use the generated web review output for user approval before writing the asset.
6. Perform the style/layout pass before writing the asset. Fix all `diagnostics`, `lossReport`, `quality`, and `reviewQuality` errors.
7. Prefer `ue.ui.apply_widget_dsl` with explicit bindings for DSL-driven writes. For hand-authored layout JSON only, run `ue.ui.validate_widget_layout` and then call `ue.ui.apply_widget_layout`.
8. Bind supported control events through MCP tools if they were not supplied to `ue.ui.apply_widget_dsl`.
9. Run `ue.ui.finalize_widget` with `compile: true`, `save: true`, and `inspect: true` if the apply tool did not already finalize.
10. Visually verify the result in the widget designer or screenshot before reporting completion.
11. If generated C++ changed, run `ue.project.rebuild_cpp_with_editor_restart` by default. Use `ue.project.build_cpp` only when UE is already closed or a no-restart build is explicitly wanted.

For tool sequence details and examples, read `references/tool-workflow.md`.
