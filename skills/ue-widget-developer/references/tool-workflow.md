# Tool Workflow

Use the private MCP bridge tools in this order. Keep every asset path inside `/Game/MistyPlanet/UI/`.

## Standard Sequence

1. `ue.project.status`
2. `ue.ui.inspect_widget_tree`
3. For non-trivial widgets, call `ue.ui.generate_widget_cpp` to preview the C++ base class, then `ue.ui.write_widget_cpp` to write it under the generated UI C++ folders.
4. Compile the project so the C++ class is available. Prefer `ue.project.rebuild_cpp_with_editor_restart` for normal UBT rebuilds because it closes UE, builds, and reopens UE automatically.
5. Call `ue.ui.create_widget_blueprint` with `parentClass`, or `ue.ui.set_widget_parent_class` for an existing Widget Blueprint.
6. Draft the final layout spec and run a style/layout pass before writing asset changes.
7. Call `ue.ui.validate_widget_layout`. Use `profile: "settings"` for settings/menu settings panels. Fix all errors before writing.
8. Call `ue.ui.create_widget_blueprint` or `ue.ui.apply_widget_layout`.
9. Bind supported events with the matching bridge binding tool.
10. Call `ue.ui.finalize_widget` with `compile: true`, `save: true`, and `inspect: true`.
11. Visually inspect the result in Unreal. Do not report completion if the layout is cramped, unstyled, unreadable, or only default UMG controls.
12. If generated C++ changed, call `ue.project.rebuild_cpp_with_editor_restart` unless you intentionally want to keep UE closed or use Live Coding.

If any step reports warnings or diagnostics, stop and summarize them before making another mutation.

## Design Quality Gate

Before applying a non-trivial layout, validate it:

```json
{
  "profile": "settings",
  "viewport": { "width": 1280, "height": 720 },
  "layout": {
    "root": {
      "type": "CanvasPanel",
      "name": "RootCanvas"
    }
  }
}
```

The validator rejects settings screens that cram many controls into one unpaged column, omit scroll/page structure, omit styled containers, or rely on default top-left Canvas placement. A settings UI should normally use:

- A centered or responsive shell with `Border`/`Overlay` styling.
- Left tabs or a `WidgetSwitcher` for categories.
- `ScrollBox` for dense setting rows.
- Styled buttons and backgrounds, not default gray UMG controls.
- A clear action row for Apply/Reset/Close.
- Layout sized for 1280x720 first, then scalable upward.

## C++ Base Class Example

Use the pure generator first when reviewing output:

```json
{
  "className": "UWBP_SettingBase",
  "category": "Settings",
  "functions": [
    { "name": "HandleVolumeChanged" },
    { "name": "HandleFullscreenChanged" },
    { "name": "HandleResolutionChanged" }
  ],
  "bindings": [
    { "type": "USlider", "name": "VolumeSlider" },
    { "type": "UCheckBox", "name": "FullscreenCheckBox" },
    { "type": "UComboBoxString", "name": "ResolutionComboBox" }
  ]
}
```

Then call `ue.ui.write_widget_cpp` with the same payload. The writer is restricted to:

- `Source/MistyPlanet/Public/UI/Generated/`
- `Source/MistyPlanet/Private/UI/Generated/`

After Unreal compiles the class, create or reparent the Widget Blueprint:

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "parentClass": "/Script/MistyPlanet.WBP_SettingBase"
}
```

## Layout Example

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Shop",
  "root": {
    "name": "RootCanvas",
    "class": "CanvasPanel",
    "children": [
      {
        "name": "TitleText",
        "class": "TextBlock",
        "slot": {
          "anchors": { "minimum": [0.5, 0.0], "maximum": [0.5, 0.0] },
          "alignment": [0.5, 0.0],
          "position": [0.0, 48.0],
          "size": [520.0, 64.0]
        },
        "properties": {
          "text": "Shop"
        }
      },
      {
        "name": "CloseButton",
        "class": "Button",
        "slot": {
          "anchors": { "minimum": [1.0, 0.0], "maximum": [1.0, 0.0] },
          "alignment": [1.0, 0.0],
          "position": [-32.0, 32.0],
          "size": [160.0, 48.0]
        },
        "children": [
          {
            "name": "CloseButtonText",
            "class": "TextBlock",
            "properties": {
              "text": "Close"
            }
          }
        ]
      }
    ]
  }
}
```

Use stable, descriptive widget names. Prefer `CanvasPanel` roots for screen layout unless the existing widget uses a different root that should be preserved.

For Canvas children, put position data under `slot`:

```json
{
  "type": "Border",
  "name": "SettingsFrame",
  "backgroundColor": "#101821DD",
  "padding": [24, 24, 24, 24],
  "slot": {
    "anchors": { "minimum": [0.5, 0.5], "maximum": [0.5, 0.5] },
    "alignment": [0.5, 0.5],
    "size": [1040, 620],
    "zOrder": 1
  }
}
```

## Button Binding Example

First ensure the target function exists on the widget class and is Blueprint-callable. If helper generation is needed, generate UI-only code through the MCP server, then let Unreal compile normally.

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Shop",
  "buttonName": "CloseButton",
  "functionName": "CloseShop"
}
```

## Setting Control Binding Examples

Slider handlers must accept the delegate value payload, typically one `float`.

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "sliderName": "VolumeSlider",
  "functionName": "HandleVolumeChanged"
}
```

Checkbox handlers must accept `bool` or `ECheckBoxState`.

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "checkboxName": "FullscreenCheckBox",
  "functionName": "HandleFullscreenChanged"
}
```

Combo box handlers must accept the selected `FString`; if the bridge cannot safely match the full delegate signature, stop and report the limitation instead of creating a partial binding.

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "comboboxName": "ResolutionComboBox",
  "functionName": "HandleResolutionChanged"
}
```

After binding, always run `ue.ui.finalize_widget`. Report the bound control, function name, compile result, save result, and any diagnostics.

## Finalize Widget Example

Use this after every create, layout, or event-binding sequence:

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "compile": true,
  "save": true,
  "inspect": true
}
```

Report `compiled`, `errorCount`, `warningCount`, `saved`, and `packageDirtyAfterSave`. If `errorCount` is non-zero, stop before making further mutations.

## Blueprint Context Example

Use this read-only tool when you need background information from a gameplay or UI Blueprint before deciding how to wire UI behavior:

```json
{
  "assetPath": "/Game/MistyPlanet/Blueprints/Weapon/WeaponBase/BP_GunBase",
  "includeGraphSummary": true,
  "includeClassDefaults": false
}
```

The result includes parent/generated class, variables, component summary, function graphs, event graphs, macro graphs, and limited node titles. It is read-only and accepts `/Game/` Blueprint paths; UI write tools remain restricted to `/Game/MistyPlanet/UI/`.

## Project C++ Build Example

Use this only when UE is already closed or you explicitly do not want editor lifecycle automation:

```json
{
  "target": "MistyPlanetEditor",
  "platform": "Win64",
  "configuration": "Development",
  "waitMutex": true,
  "noHotReload": true
}
```

This runs UBT from the MCP process. For routine generated C++ work, prefer the combined restart tool:

```json
{
  "target": "MistyPlanetEditor",
  "platform": "Win64",
  "configuration": "Development",
  "waitMutex": true,
  "noHotReload": true,
  "closeEditor": true,
  "openEditor": true,
  "forceClose": true
}
```

`ue.project.rebuild_cpp_with_editor_restart` performs close UE -> UBT build -> open UE. Report the close/build/open result fields if any stage fails.
