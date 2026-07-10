# Tool Workflow

Use the private MCP bridge tools in this order. Keep every asset path inside `/Game/MistyPlanet/UI/`.

## Standard Sequence

1. `ue.project.status`
2. `ue.ui.inspect_widget_tree`
3. For non-trivial widgets, generate/write and compile the C++ base class, then create or reparent the Widget Blueprint.
4. Read `project-ui-context.md` and `visual-design-rubric.md`; record the design-language brief and visual direction.
5. Have AI create the screen in Figma with native frames, auto-layout, text, and supported component structure.
6. Export or obtain the target Figma root node JSON. Use semantic layer names: `Panel/`, `VerticalBox/`, `HorizontalBox/`, `Scroll/`, `Text/`, `Button/`, `Slider/`, `Toggle/`, `CheckBox/`, `Select/`, `ComboBox/`.
7. Call `ue.ui.review_figma_widget`. Use `profile: "settings"` for settings panels. Fix all `diagnostics`, `lossReport`, and `quality` errors before writing.
8. Call `ue.ui.apply_figma_widget` with explicit bindings. It imports, validates, applies, binds, and finalizes in one guarded sequence.
9. For hand-authored layout JSON only, call `ue.ui.validate_widget_layout`, `ue.ui.apply_widget_layout`, bind events, and finalize.
10. Visually inspect the result in Unreal. Do not report completion when the layout is cramped, unreadable, generic, or dominated by default UMG controls.

If any step reports warnings or diagnostics, stop and resolve them before another mutation.

## Figma Review Example

Use this before mutating Unreal assets. The root is a Figma frame; a `Role/WidgetName` layer prefix controls UMG conversion.

```json
{
  "profile": "settings",
  "node": {
    "type": "FRAME",
    "name": "SettingsScreen",
    "absoluteBoundingBox": { "width": 1920, "height": 1080 },
    "layoutMode": "VERTICAL",
    "children": [
      {
        "type": "FRAME",
        "name": "Panel/SettingsRoot",
        "layoutMode": "VERTICAL",
        "children": [
          { "type": "TEXT", "name": "Text/TitleText", "characters": "SETTINGS" },
          {
            "type": "FRAME",
            "name": "Button/ApplyButton",
            "children": [{ "type": "TEXT", "name": "ApplyLabel", "characters": "Apply" }]
          }
        ]
      }
    ]
  }
}
```

A usable review result has `diagnostics: []`, `lossReport: []`, and `quality.ok: true`. Figma-to-UMG conversion is structural: unsupported Figma nodes are reported rather than silently discarded. Passing structural quality is not enough; the design must also follow the project UI context and originality gates.

## Apply Figma Example

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "profile": "settings",
  "node": {
    "type": "FRAME",
    "name": "SettingsScreen",
    "layoutMode": "VERTICAL",
    "children": [
      {
        "type": "FRAME",
        "name": "Button/ApplyButton",
        "children": [{ "type": "TEXT", "name": "ApplyLabel", "characters": "Apply" }]
      }
    ]
  },
  "bindings": {
    "buttons": [{ "widget": "ApplyButton", "function": "ApplySettings" }]
  },
  "compile": true,
  "save": true,
  "inspect": true
}
```

If the tool returns `blocked: true`, do not call lower-level apply, bind, or finalize tools. Fix the reported conversion or quality issue first.
