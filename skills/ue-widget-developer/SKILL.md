---
name: ue-widget-developer
description: Use when Codex needs to create, inspect, edit, validate, or wire Unreal Engine 5.7 UMG Widget Blueprints for MistyPlanet through the private MCP bridge.
---

# UE Widget Developer

Use the private MCP bridge for MistyPlanet UI work only. Limit changes to UMG Widget Blueprints under `/Game/MistyPlanet/UI/` and generated UI helper code under `Source/MistyPlanet/Public/UI/Generated/` and `Source/MistyPlanet/Private/UI/Generated/`.

## Skill Precedence

For MistyPlanet UMG Widget Blueprint work, this skill is the primary orchestration workflow. For every new or redesigned screen, invoke `frontend-design` first to create the approved web design; that web result is the visual source of truth for the UMG implementation.

Do not create, reparent, or mutate a Widget Blueprint before the web-design stage has been reviewed and explicitly approved by the user, unless the user supplies an already-approved visual reference and explicitly asks to skip web design. Widget DSL Review Console is a mapping review tool; it never replaces the web-design approval gate.

Do not write a superpowers spec or implementation plan for routine widget creation. Use generic brainstorming only when the user explicitly asks for open-ended product ideation before any UE widget work, or when the request is not yet scoped to a MistyPlanet Widget Blueprint.

## Rules

### Mandatory Design-to-Widget Pipeline

For every new or redesigned screen, follow this order without skipping or reordering stages:

1. **Discover** — inspect the existing project UI, assets, and target widget; record visual language plus intended interactions.
2. **Design the web screen** — invoke `frontend-design` and build a working web page at the target fullscreen viewport with real web controls. Do not mutate Unreal assets in this stage.
3. **Approve the web design** — show the web design to the user, iterate until approved, and save its default state at 100% scale as the visual baseline. Do not begin UMG work before approval.
4. **Write the mapping contract** — map each visible web element to a native UMG class and stable widget name; map each interactive control to a UMG control and handler. Preserve geometry, hierarchy, palette, typography, and default state.
5. **Map layout to UMG** — build a genuine UMG tree from the contract. First make layout and default visual state match the approved web page. Do not add settings/gameplay behavior before this visual-layout gate passes.
6. **Implement interaction** — only after layout alignment, create/update UI-only C++ and bind interactive controls through the bridge. Verify the visible state responds to each control.
7. **Verify independently** — compile/save, inspect WidgetTree and EventGraph, capture at the same viewport, compare to the approved web baseline, and obtain a separate read-only visual review. Do not report completion while material visual differences or missing bindings remain.

### Native-Control Integrity

- Never place a full-screen `Image`, imported screenshot, render target, or web capture in a production Widget Blueprint to imitate UI.
- Never use invisible or inert controls over a screenshot to simulate interaction.
- Reject a mapping if a visible web control lacks a native UMG counterpart, or an interactive web control lacks a named handler.
- If an experiment degrades a captured result, revert it before finalizing; do not leave it as the final asset.

- Inspect before every edit. Read the existing widget tree and preserve names, hierarchy, bindings, and user-authored behavior unless the request explicitly changes them.
- Before designing new or redesigned UI, gather project UI context. First search for written UI/design/style guidance; if none exists, infer the project's UI language from existing screens, reusable components, art assets, fonts, icons, and materials. Use `references/project-ui-context.md` for the universal search order, evidence note, and design-language brief.
- Use a layout spec for creation and layout edits. Define widget names, classes, hierarchy, anchors, offsets, alignment, size, text, style-relevant properties, and intended bindings before applying layout.
- For non-trivial new UI or redesigns, use the approved web page as the visual source of truth and Widget DSL as the UMG mapping source protocol. The generated HTML Review Console is a controlled inspection surface for that mapping, not a replacement web design.
- For visual-sync work from an approved web UI, the approved web screenshot is the baseline: capture it at the target viewport and 100% scale before any Unreal mutation, then compare the finalized UMG capture in the same default state. Save and inspect the baseline, UMG capture, overlay, and heatmap; a compile/save result alone never satisfies this gate.
- Product UI must look designed, not like default UMG controls. For settings/menu screens, use a styled shell, clear visual hierarchy, tab/page or scroll structure, deliberate spacing, and action rows.
- Before drafting non-trivial UI, run the project context gate in `references/project-ui-context.md` and the visual originality gate in `references/visual-design-rubric.md`. Do not reuse the examples in this skill as a layout template. Define a visual direction that follows the inferred project UI language, plus composition archetype, motif, palette, density, project references used, and at least one deliberate difference from recent local prototypes or review outputs before writing DSL.
- Before writing a non-trivial DSL layout to Unreal, call `ue.ui.review_widget_dsl` and inspect `diagnostics`, `lossReport`, `quality`, and `reviewQuality`. Do not write if any diagnostics, loss entries, or error issues remain.
- Prefer `ue.ui.apply_widget_dsl` for DSL-driven writes. It compiles the DSL, validates layout/review quality, applies the UMG layout, binds supported events, and finalizes the widget in one guarded sequence.
- For DSL-driven layout writes, use `ue.ui.review_widget_dsl` followed by `ue.ui.apply_widget_dsl`; `apply_widget_dsl` performs its guarded validation path. For hand-authored layout JSON only, call `ue.ui.validate_widget_layout` with the target profile and viewport before `ue.ui.apply_widget_layout`.
- For non-trivial widgets, create the genuine UMG layout first after web approval. Once visual layout is aligned, create or update the C++ `UUserWidget` base class, compile it in Unreal, then bind the approved controls to behavior.
- When generated C++ requires a normal UBT rebuild, use `ue.project.rebuild_cpp_with_editor_restart` so the tool closes UE, builds C++, and reopens UE without asking the user to do it manually.
- Use `ue.blueprint.inspect` for read-only context on any Blueprint under `/Game/` when you need to understand its parent class, functions, variables, components, or graph summary before editing UI. Non-UI Blueprints are inspect-only context; do not write to them.
- Run a style/layout pass before any asset write. Confirm hierarchy, spacing, anchors, slot rules, text, colors, visibility, paging/scroll behavior, and setting-control names in the spec before calling create/apply layout tools.
- Use the game's default fullscreen viewport as the primary layout baseline for new or redesigned widgets. Do not hard-code a fixed resolution as the design target; treat the root canvas as fullscreen/fill-parent and keep the layout scalable for common fullscreen resolutions. If a review or validation tool requires numeric viewport values, use the current target fullscreen viewport and state that value in the review notes.
- Do not accept compile/save as UI completion. After writing UI, visually inspect the widget in Unreal Designer and check that text fits, controls are aligned, content is not cramped, and default gray UMG styling is not dominating the screen. Use `ue.ui.capture_widget_preview` to render the finalized Widget Blueprint to a deterministic 1920x1080 PNG, then use `ue.ui.compare_ui_images` to compare it against the approved project-local reference. Inspect the reference, captured PNG, and heatmap before reporting visual fidelity.
- Finalize after every Widget edit with `ue.ui.finalize_widget`. It compiles the Widget Blueprint, saves the package, and can return the final widget tree. Report compiler or validation diagnostics.
- Wire supported UI events only through bridge binding tools. Bind buttons, sliders, checkboxes, and combo boxes to existing or generated Blueprint-callable UI functions with compatible signatures.
- Do not use raw Python, raw Unreal Remote Control, direct asset mutation, or ad hoc editor scripting.
- Do not touch non-UI assets, gameplay files, Content outside `/Game/MistyPlanet/UI/`, Config, plugin files, or shared project source unless the user explicitly scopes a UI helper generation task through the bridge.
- Do not commit private tool artifacts or generated local bridge files.

## Workflow

1. Check bridge status.
2. Inspect the target widget tree.
3. For new or redesigned UI, read `references/project-ui-context.md`, gather design evidence, read `references/visual-design-rubric.md`, and write a short visual direction note.
4. Invoke `frontend-design` to build the working web screen first. Review with the user; capture and retain the approved default-state baseline at 100% scale and target viewport. Do not mutate Unreal before this approval.
5. Write the web-to-UMG mapping contract: native UMG class, stable name, anchors/geometry, styles/default state, and handler for every interactive control.
6. Draft Widget DSL/layout from the contract. Call `ue.ui.review_widget_dsl`; fix all `diagnostics`, `lossReport`, `quality`, and `reviewQuality` errors.
7. Apply only the native UMG layout. Prefer `ue.ui.apply_widget_dsl`; for hand-authored JSON use `ue.ui.validate_widget_layout` then `ue.ui.apply_widget_layout`. Capture and compare against the web baseline before behavior work.
8. After visual layout aligns, create/update the UI-only C++ base class, compile it, and bind buttons, sliders, checkboxes, and combo boxes through MCP tools. Verify control feedback and default state synchronization.
9. Run `ue.ui.finalize_widget` with `compile: true`, `save: true`, and `inspect: true` after every asset or binding mutation.
10. Capture the finalized UMG state, compare it with the approved web baseline, inspect baseline/capture/overlay/heatmap, and require a separate read-only reviewer for visual-sync work. Iterate until material differences are resolved or explicitly accepted by the user.
11. If generated C++ changed, run `ue.project.rebuild_cpp_with_editor_restart` by default. Use `ue.project.build_cpp` only when UE is already closed or a no-restart build is explicitly wanted.

For tool sequence details and examples, read `references/tool-workflow.md`.
