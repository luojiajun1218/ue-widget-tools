# Tool Workflow

Use the private MCP bridge tools in this order. Keep every asset path inside `/Game/MistyPlanet/UI/`.

## Skill Routing

For a new or redesigned screen, start with `frontend-design`: create a working web design, get explicit user approval, and save its 100%-scale default-state capture before any Unreal mutation. The web design is the visual source of truth. This document's Widget DSL Review Console reviews the later UMG mapping; it is not the design gate by itself.

Do not write a superpowers spec or implementation plan for routine widget creation. Do not create/reparent/mutate a Widget Blueprint until the approved web baseline and web-to-UMG mapping contract exist, unless the user explicitly supplies an approved reference and asks to skip web design.

## Standard Sequence

1. `ue.project.status`
2. `ue.ui.inspect_widget_tree`
3. For new or redesigned UI, read `project-ui-context.md` and `visual-design-rubric.md`, then invoke `frontend-design` to create the working web page at the target viewport.
4. Obtain explicit user approval for the web page and capture its exact default-state baseline. Do not mutate Unreal before this step passes.
5. Write the web-to-UMG mapping contract: every visible web element needs a native UMG class/name; every interactive web control needs a handler target.
6. Draft Widget DSL from that mapping. Call `ue.ui.review_widget_dsl`. Fix all `diagnostics`, `lossReport`, `quality`, and `reviewQuality` errors before writing.
7. Apply the native UMG layout with no full-screen image/capture layers and no behavior bindings yet. Prefer `ue.ui.apply_widget_dsl` without bindings; for hand-authored JSON, call `ue.ui.validate_widget_layout` then `ue.ui.apply_widget_layout`.
8. Capture and compare the layout/default state against the approved web baseline. Iterate until geometry, palette, typography, and control states align.
9. Only now generate/write the UI-only C++ base class when needed, compile it, and bind controls through MCP tools.
10. Finalize, capture, compare, and inspect WidgetTree plus EventGraph. Obtain a separate read-only visual review before reporting visual-sync completion.
11. If generated C++ changed, call `ue.project.rebuild_cpp_with_editor_restart` unless you intentionally want to keep UE closed or use Live Coding.

If any step reports warnings or diagnostics, stop and summarize them before making another mutation.

## Widget DSL Review Example

Use this before mutating Unreal assets:

Use fill-parent fullscreen layout as the default design target. Do not put `width` or `height` on the root `Canvas` unless the widget is intentionally fixed-size.

```json
{
  "profile": "settings",
  "source": "<Widget name=\"Settings\"><Canvas name=\"SettingsScreen\"><Border name=\"SettingsRoot\" fill padding={[40,36,40,36]} backgroundColor=\"panel\"><VerticalBox name=\"SettingsLayout\" fill><Text name=\"TitleText\" text=\"SETTINGS\" variant=\"title\" /><SettingRow label=\"Brightness\" labelWidth={320} controlFill={true}><Slider name=\"BrightnessSlider\" value={0.62} /></SettingRow></VerticalBox></Border></Canvas></Widget>"
}
```

A usable review result has:

- `diagnostics: []`
- `lossReport: []`
- `quality.ok: true`
- `reviewQuality.ok: true`

The generated Review Console is for review only. It may select a Widget name and simulate visual states, but it never edits the DSL directly. The generated layout is the UMG write payload. Passing structural quality is not enough: reject the design if it does not cite project UI references and follow the design-language brief from `project-ui-context.md`, or if it matches the anti-templates in `visual-design-rubric.md`.

## Apply Widget DSL Example

Use this after review passes and the user has accepted the visual direction:

Use the reviewed fill-parent DSL after the visual direction is accepted.

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "profile": "settings",
  "source": "<Widget name=\"Settings\"><Canvas name=\"SettingsScreen\"><Border name=\"SettingsRoot\" fill padding={[40,36,40,36]} backgroundColor=\"panel\"><VerticalBox name=\"SettingsLayout\" fill><SettingRow label=\"Brightness\" labelWidth={320} controlFill={true}><Slider name=\"BrightnessSlider\" value={0.62} /></SettingRow><HorizontalBox name=\"ActionRow\" alignSelf=\"right\"><Button name=\"ApplyButton\" text=\"Apply\" variant=\"primary\" /></HorizontalBox></VerticalBox></Border></Canvas></Widget>",
  "bindings": {
    "buttons": [
      { "widget": "ApplyButton", "function": "ApplySettings" }
    ],
    "sliders": [
      { "widget": "BrightnessSlider", "function": "HandleBrightnessChanged" }
    ]
  },
  "compile": true,
  "save": true,
  "inspect": true
}
```

If the tool returns `blocked: true`, do not call lower-level apply/bind/finalize tools. Fix the reported diagnostics or quality issues first.

## Design Quality Gate

Before applying a non-trivial layout, validate it:

```json
{
  "profile": "settings",
  "layout": {
    "root": {
      "type": "CanvasPanel",
      "name": "RootCanvas"
    }
  }
}
```

The validator rejects settings screens that cram many controls into one unpaged column, omit scroll/page structure, omit styled containers, or rely on default top-left Canvas placement. A settings UI should normally use:

- A fullscreen fill-parent shell with `Border`/`Overlay` styling.
- Left tabs or a `WidgetSwitcher` for categories.
- `ScrollBox` for dense setting rows.
- Styled buttons and backgrounds, not default gray UMG controls.
- A clear action row for Apply/Reset/Close.
- Layout that fills the parent and remains usable across fullscreen resolutions.

## C++ Base Class Example

Use the pure generator first when reviewing output:

```json
{
  "className": "UWBP_SettingBase",
  "category": "Settings",
  "functions": [
    { "name": "HandleMasterVolumeChanged" },
    { "name": "HandleMusicVolumeChanged" },
    { "name": "HandleSfxVolumeChanged" },
    { "name": "HandleFullscreenChanged" },
    { "name": "HandleResolutionChanged" }
  ],
  "bindings": [
    { "type": "USlider", "name": "MasterVolumeSlider" },
    { "type": "USlider", "name": "MusicVolumeSlider" },
    { "type": "USlider", "name": "SfxVolumeSlider" },
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
  "sliderName": "MasterVolumeSlider",
  "functionName": "HandleMasterVolumeChanged"
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

## Visual Fidelity Capture and Comparison

The capture command is read-only with respect to assets. It accepts only Widget Blueprints under `/Game/MistyPlanet/UI/` and writes only to `Saved/WidgetBridge/Previews`:

```json
{
  "assetPath": "/Game/MistyPlanet/UI/WBP_Setting",
  "captureId": "settings-default"
}
```

Compare a project-local approved reference against the captured candidate. The candidate must remain in `Saved/WidgetBridge/Previews`; the heatmap is written there as well:

```json
{
  "referencePath": ".superpowers/brainstorm/settings-web-20260715/review-v2b.png",
  "candidatePath": "Saved/WidgetBridge/Previews/settings-default.png",
  "comparisonId": "settings-default-review",
  "pixelThreshold": 12
}
```

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
